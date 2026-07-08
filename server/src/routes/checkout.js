import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { getCieloConfig } from '../services/cieloConfig.js';
import { getAvailablePaymentMethods, resolvePaymentProvider, getCheckoutPaymentMethod } from '../services/paymentMethods.js';
import { rowToEntity, rowsToEntities } from '../utils/helpers.js';
import {
  buildCieloPayload,
  createCieloCheckout,
  buildOrderNumber,
  WRAPPING_PRICES,
} from '../services/cielo.js';
import {
  getCorreiosConfig,
  buildPackageFromProducts,
  resolveShippingQuote,
} from '../services/correios.js';
import { normalizeAddressInput, validateAddressFields } from '../utils/address.js';
import {
  extractCieloAuthorizationCode,
  extractCieloMerchantOrderNumber,
  extractCieloPaymentId,
  mapCieloPaymentStatus,
} from '../utils/cieloWebhook.js';
import { trackCorreiosPackage } from '../services/correiosTracking.js';
import { normalizeProductQuantity } from '../utils/productStock.js';
import { resolveVariantAvailability, decrementProductVariantStock } from '../utils/productVariants.js';
import { streamOrderInvoice, withInvoiceFlags, withInvoiceFlagsList } from '../services/invoiceAccess.js';

const router = Router();

const VALID_PAYMENT_METHODS = ['pix', 'cartao_credito', 'boleto', 'test'];

function calcTotals(cartItems, shippingCost = 0) {
  const subtotal = cartItems.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.quantity || 1),
    0
  );
  const wrappingCost = cartItems.reduce(
    (sum, item) => sum + (WRAPPING_PRICES[item.wrapping] || 0),
    0
  );
  const shipping = Number(shippingCost) || 0;
  return {
    subtotal,
    wrappingCost,
    shippingCost: shipping,
    total: subtotal + wrappingCost + shipping,
  };
}

async function loadCartProducts(userId) {
  const result = await pool.query(
    `SELECT ci.quantity, p.weight_kg, p.length_cm, p.width_cm, p.height_cm
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1`,
    [userId]
  );
  return result.rows;
}

async function resolveShippingForCheckout(userId, customerZip, shippingServiceId) {
  if (!customerZip?.trim()) {
    throw new Error('Informe o CEP para calcular o frete');
  }
  if (!shippingServiceId) {
    throw new Error('Selecione uma opção de frete');
  }

  const config = await getCorreiosConfig();
  const cartProducts = await loadCartProducts(userId);
  if (cartProducts.length === 0) {
    throw new Error('Seu carrinho está vazio');
  }

  const packageInfo = buildPackageFromProducts(cartProducts, config);
  return resolveShippingQuote({
    destinationZip: customerZip,
    serviceId: shippingServiceId,
    packageInfo,
  });
}

async function loadCart(userId) {
  const cartResult = await pool.query(
    'SELECT * FROM cart_items WHERE user_id = $1 ORDER BY created_date DESC',
    [userId]
  );
  return cartResult.rows;
}

async function validateCartStock(userId) {
  const result = await pool.query(
    `SELECT ci.product_name, ci.quantity AS cart_quantity, ci.variant_color, ci.variant_size,
            p.quantity AS stock_quantity, p.variants
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1`,
    [userId]
  );

  for (const item of result.rows) {
    const cartQuantity = normalizeProductQuantity(item.cart_quantity);
    const availability = resolveVariantAvailability(
      { quantity: item.stock_quantity, variants: item.variants },
      item.variant_color,
      item.variant_size
    );

    if (!availability.available) {
      throw new Error(`"${item.product_name}" está indisponível para a combinação selecionada.`);
    }

    if (cartQuantity > availability.quantity) {
      throw new Error(`Estoque insuficiente para "${item.product_name}". Disponível: ${availability.quantity}.`);
    }
  }
}

async function consumeCartStock(userId) {
  const result = await pool.query(
    `SELECT ci.product_id, ci.quantity, ci.variant_color, ci.variant_size
     FROM cart_items ci
     WHERE ci.user_id = $1`,
    [userId]
  );

  for (const item of result.rows) {
    await decrementProductVariantStock(
      pool,
      item.product_id,
      item.variant_color,
      item.variant_size,
      item.quantity
    );
  }
}

async function createOrderFromCart({ userId, customer, paymentMethod, shipping }) {
  const cartItems = await loadCart(userId);

  if (cartItems.length === 0) {
    const err = new Error('Seu carrinho está vazio');
    err.status = 400;
    throw err;
  }

  await validateCartStock(userId);

  const { subtotal, wrappingCost, shippingCost, total } = calcTotals(cartItems, shipping.price);
  const orderItems = cartItems.map((item) => ({
    product_id: item.product_id,
    product_name: item.product_name,
    quantity: item.quantity || 1,
    unit_price: Number(item.price),
    total: Number(item.price) * Number(item.quantity || 1),
    wrapping: item.wrapping || 'none',
  }));

  const orderResult = await pool.query(
    `INSERT INTO orders (
      customer_name, customer_email, customer_phone, customer_address,
      items, subtotal, wrapping_cost, shipping_cost, shipping_service_code,
      shipping_service_name, shipping_deadline_days, total, status, payment_method,
      payment_status, notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [
      customer.customer_name.trim(),
      customer.customer_email.trim().toLowerCase(),
      customer.customer_phone || null,
      customer.customer_address || null,
      JSON.stringify(orderItems),
      subtotal,
      wrappingCost,
      shippingCost,
      shipping.service_code,
      shipping.label,
      shipping.deadline_days,
      total,
      'pendente',
      paymentMethod,
      'aguardando_pagamento',
      customer.customer_zip_code ? `CEP: ${customer.customer_zip_code}` : null,
    ]
  );

  await consumeCartStock(userId);

  return rowToEntity(orderResult.rows[0]);
}

async function startCheckout(req, res) {
  const {
    customer_name,
    customer_email,
    customer_phone,
    customer_document,
    customer_zip_code,
    shipping_service_id: shippingServiceId,
  } = req.body;

  const paymentMethod = await getCheckoutPaymentMethod();

  if (!customer_name?.trim() || !customer_email?.trim()) {
    return res.status(400).json({ message: 'Nome e e-mail são obrigatórios' });
  }

  const address = normalizeAddressInput(req.body);
  const missingAddress = validateAddressFields(address);
  if (missingAddress.length > 0) {
    return res.status(400).json({
      message: `Preencha o endereço: ${missingAddress.join(', ')}`,
    });
  }

  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ message: 'Forma de pagamento não configurada' });
  }

  const customer = {
    customer_name,
    customer_email,
    customer_phone,
    customer_document,
    customer_zip_code,
    customer_address: address.customer_address,
    address_street: address.address_street,
    address_number: address.address_number,
    address_complement: address.address_complement,
    address_district: address.address_district,
    address_city: address.address_city,
    address_state: address.address_state,
  };

  let shipping;
  try {
    shipping = await resolveShippingForCheckout(req.user.id, customer_zip_code, shippingServiceId);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }

  let providerInfo;
  try {
    providerInfo = await resolvePaymentProvider(paymentMethod);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }

  const order = await createOrderFromCart({
    userId: req.user.id,
    customer,
    paymentMethod,
    shipping,
  });

  if (providerInfo.provider === 'test') {
    await pool.query(
      `UPDATE orders SET payment_status = 'pago', status = 'confirmado', updated_date = NOW() WHERE id = $1`,
      [order.id]
    );
    await pool.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);

    return res.json({
      type: 'test',
      order_id: order.id,
      redirect_url: `/pagamento/retorno?pedido=${order.id}`,
      message: 'Pedido de teste aprovado automaticamente',
    });
  }

  if (providerInfo.provider === 'manual_pix') {
    return res.json({
      type: 'manual_pix',
      order_id: order.id,
      total: order.total,
      pix_key: providerInfo.pixKey,
      pix_holder: providerInfo.pixHolder,
      redirect_url: `/pagamento/pix?pedido=${order.id}`,
    });
  }

  const cieloConfig = providerInfo.cieloConfig;
  const returnUrl = `${cieloConfig.frontendUrl}/pagamento/retorno?pedido=${order.id}`;

  const payload = buildCieloPayload({
    order,
    customer,
    returnUrl,
    config: cieloConfig,
    shipping: {
      cost: shipping.price,
      deadlineDays: shipping.deadline_days,
      serviceName: shipping.label,
    },
  });

  const { checkoutUrl } = await createCieloCheckout(payload, {
    merchantId: cieloConfig.merchantId,
    checkoutApiUrl: cieloConfig.checkoutApiUrl,
  });

  const gatewayOrderNumber = buildOrderNumber(order.id);

  await pool.query(
    'UPDATE orders SET gateway_order_number = $1, updated_date = NOW() WHERE id = $2',
    [gatewayOrderNumber, order.id]
  );

  return res.json({
    type: 'cielo',
    checkout_url: checkoutUrl,
    order_id: order.id,
    gateway_order_number: gatewayOrderNumber,
    payment_method: paymentMethod,
  });
}

router.get('/metodos', requireAuth, async (_req, res) => {
  try {
    const methods = await getAvailablePaymentMethods();
    const checkoutMethod = await getCheckoutPaymentMethod();
    res.json({ methods, checkout_method: checkoutMethod });
  } catch (err) {
    console.error('Erro ao listar métodos de pagamento:', err);
    res.status(500).json({ message: 'Erro ao carregar formas de pagamento' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    await startCheckout(req, res);
  } catch (err) {
    console.error('Erro ao iniciar checkout:', err);
    res.status(err.status || 500).json({ message: err.message || 'Erro ao iniciar pagamento' });
  }
});

router.post('/cielo', requireAuth, async (req, res) => {
  try {
    req.body.payment_method = req.body.payment_method || 'cartao_credito';
    await startCheckout(req, res);
  } catch (err) {
    console.error('Erro ao iniciar checkout Cielo:', err);
    res.status(err.status || 500).json({ message: err.message || 'Erro ao iniciar pagamento' });
  }
});

router.get('/meus-pedidos', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, status, payment_status, payment_method, total, subtotal, wrapping_cost,
              shipping_cost, shipping_service_name, shipping_deadline_days, tracking_code,
              shipping_label_url, cielo_authorization_code, items, created_date, updated_date
       FROM orders
       WHERE LOWER(customer_email) = LOWER($1)
       ORDER BY created_date DESC
       LIMIT 50`,
      [req.user.email]
    );

    res.json(withInvoiceFlagsList(rowsToEntities(result.rows)));
  } catch (err) {
    console.error('Erro ao listar pedidos do cliente:', err);
    res.status(500).json({ message: 'Erro ao carregar seus pedidos' });
  }
});

router.get('/pedido/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, status, payment_status, payment_method, total, subtotal, wrapping_cost,
              shipping_cost, shipping_service_code, shipping_service_name, shipping_deadline_days,
              tracking_code, shipping_label_url, cielo_authorization_code, gateway_order_number,
              customer_name, customer_address, items, created_date, updated_date, shipped_at
       FROM orders WHERE id = $1 AND LOWER(customer_email) = LOWER($2)`,
      [req.params.id, req.user.email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Pedido não encontrado' });
    }

    res.json(withInvoiceFlags(rowToEntity(result.rows[0])));
  } catch (err) {
    res.status(500).json({ message: 'Erro ao buscar pedido' });
  }
});

router.get('/pedido/:id/rastreio', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, tracking_code, status, payment_status, customer_email
       FROM orders WHERE id = $1 AND LOWER(customer_email) = LOWER($2)`,
      [req.params.id, req.user.email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Pedido não encontrado' });
    }

    const order = rowToEntity(result.rows[0]);
    if (!order.tracking_code) {
      return res.status(400).json({ message: 'Seu pedido ainda não possui código de rastreio' });
    }

    const tracking = await trackCorreiosPackage(order.tracking_code);
    res.json({
      order_id: order.id,
      order_status: order.status,
      payment_status: order.payment_status,
      ...tracking,
    });
  } catch (err) {
    console.error('Erro ao rastrear pedido do cliente:', err);
    res.status(500).json({ message: err.message || 'Erro ao rastrear pedido' });
  }
});

router.get('/pedido/:id/nota-fiscal/:type', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND LOWER(customer_email) = LOWER($2)',
      [req.params.id, req.user.email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Pedido não encontrado' });
    }

    const order = rowToEntity(result.rows[0]);
    streamOrderInvoice({
      order,
      type: req.params.type,
      res,
      downloadName: `nota-fiscal-${order.id}.${req.params.type}`,
    });
  } catch (err) {
    console.error('Erro ao baixar nota fiscal do cliente:', err);
    res.status(500).json({ message: 'Erro ao baixar nota fiscal' });
  }
});

router.get('/pedido/:id/pix', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, total, payment_method, payment_status, customer_name FROM orders WHERE id = $1 AND LOWER(customer_email) = LOWER($2)',
      [req.params.id, req.user.email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Pedido não encontrado' });
    }

    const order = rowToEntity(result.rows[0]);
    if (order.payment_method !== 'pix') {
      return res.status(400).json({ message: 'Este pedido não utiliza PIX' });
    }

    const providerInfo = await resolvePaymentProvider('pix');
    if (providerInfo.provider !== 'manual_pix') {
      return res.status(400).json({ message: 'PIX deste pedido é processado pela Cielo' });
    }

    res.json({
      order_id: order.id,
      total: order.total,
      payment_status: order.payment_status,
      pix_key: providerInfo.pixKey,
      pix_holder: providerInfo.pixHolder,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erro ao buscar dados PIX' });
  }
});

router.post('/cielo/notificacao', async (req, res) => {
  try {
    const merchantOrderNumber = extractCieloMerchantOrderNumber(req.body);

    if (!merchantOrderNumber) {
      return res.status(400).json({ message: 'Notificação inválida' });
    }

    const paymentStatus = mapCieloPaymentStatus(req.body);
    const isPaid = paymentStatus === 'pago';
    const authorizationCode = extractCieloAuthorizationCode(req.body);
    const paymentId = extractCieloPaymentId(req.body);

    const result = await pool.query(
      `UPDATE orders SET
        payment_status = $1,
        status = CASE
          WHEN $2 THEN 'confirmado'
          WHEN $1 = 'recusado' OR $1 = 'cancelado' THEN 'cancelado'
          ELSE status
        END,
        cielo_authorization_code = COALESCE($3, cielo_authorization_code),
        cielo_payment_id = COALESCE($4, cielo_payment_id),
        updated_date = NOW()
      WHERE gateway_order_number = $5
      RETURNING id, customer_email`,
      [paymentStatus, isPaid, authorizationCode, paymentId, merchantOrderNumber]
    );

    if (isPaid && result.rows[0]) {
      await pool.query(
        'DELETE FROM cart_items WHERE user_id = (SELECT id FROM users WHERE email = $1 LIMIT 1)',
        [result.rows[0].customer_email]
      );
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Erro na notificação Cielo:', err);
    res.status(500).json({ message: 'Erro ao processar notificação' });
  }
});

export default router;
