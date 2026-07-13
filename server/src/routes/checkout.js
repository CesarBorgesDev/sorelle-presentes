import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { getCieloConfig } from '../services/cieloConfig.js';
import {
  getAvailablePaymentMethods,
  resolvePaymentProvider,
  getCheckoutPaymentMethod,
  getPixDiscountPercent,
  getPublicPaymentConditions,
} from '../services/paymentMethods.js';
import { rowToEntity, rowsToEntities } from '../utils/helpers.js';
import {
  buildCieloPayload,
  createCieloCheckout,
  buildOrderNumber,
} from '../services/cielo.js';
import {
  getCorreiosConfig,
  buildPackageFromProducts,
  resolveShippingQuote,
} from '../services/correios.js';
import { normalizeAddressInput, validateAddressFields } from '../utils/address.js';
import { applyCieloPaymentUpdate } from '../services/cieloNotifications.js';
import { trackCorreiosPackage } from '../services/correiosTracking.js';
import { normalizeProductQuantity } from '../utils/productStock.js';
import { resolveVariantAvailability, decrementProductVariantStock } from '../utils/productVariants.js';
import { streamOrderInvoice, withInvoiceFlags, withInvoiceFlagsList } from '../services/invoiceAccess.js';
import { STORE_PICKUP_ID, getStorePickupConfig, resolveStorePickupShipping, buildStorePickupOption } from '../services/storePickup.js';

const router = Router();

const VALID_PAYMENT_METHODS = ['pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro', 'pagar_na_loja', 'test'];

function calcTotals(cartItems, shippingCost = 0, { pixDiscountPercent = 0, applyPixDiscount = false } = {}) {
  const subtotal = cartItems.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.quantity || 1),
    0
  );
  const shipping = Number(shippingCost) || 0;
  let pixDiscount = 0;
  if (applyPixDiscount && pixDiscountPercent > 0) {
    pixDiscount = subtotal * (pixDiscountPercent / 100);
  }
  return {
    subtotal,
    shippingCost: shipping,
    pixDiscount,
    total: subtotal + shipping - pixDiscount,
  };
}

async function loadCartProducts(userId) {
  const result = await pool.query(
    `SELECT ci.quantity, ci.price, p.weight_kg, p.length_cm, p.width_cm, p.height_cm
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1`,
    [userId]
  );
  return result.rows;
}

async function resolveShippingForCheckout(userId, customerZip, shippingServiceId) {
  if (shippingServiceId === STORE_PICKUP_ID) {
    return resolveStorePickupShipping();
  }

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
  const invoiceValue = cartProducts.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
    0
  );
  return resolveShippingQuote({
    destinationZip: customerZip,
    serviceId: shippingServiceId,
    packageInfo,
    invoiceValue,
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

  const pixDiscountPercent = paymentMethod === 'pix' ? await getPixDiscountPercent() : 0;
  const { subtotal, shippingCost, pixDiscount, total } = calcTotals(
    cartItems,
    shipping.price,
    { pixDiscountPercent, applyPixDiscount: paymentMethod === 'pix' }
  );
  const orderItems = cartItems.map((item) => ({
    product_id: item.product_id,
    product_name: item.product_name,
    quantity: item.quantity || 1,
    unit_price: Number(item.price),
    total: Number(item.price) * Number(item.quantity || 1),
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
      0,
      shippingCost,
      shipping.service_code,
      shipping.label,
      shipping.deadline_days,
      total,
      'pendente',
      paymentMethod,
      'aguardando_pagamento',
      [
        customer.customer_zip_code ? `CEP: ${customer.customer_zip_code}` : null,
        pixDiscount > 0 ? `Desconto PIX: R$ ${pixDiscount.toFixed(2)}` : null,
      ].filter(Boolean).join(' | ') || null,
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

  const paymentMethod = req.body.payment_method || await getCheckoutPaymentMethod();
  const isPickup = shippingServiceId === STORE_PICKUP_ID;

  if (!customer_name?.trim() || !customer_email?.trim()) {
    return res.status(400).json({ message: 'Nome e e-mail são obrigatórios' });
  }

  const address = normalizeAddressInput(req.body);
  if (!isPickup) {
    const missingAddress = validateAddressFields(address);
    if (missingAddress.length > 0) {
      return res.status(400).json({
        message: `Preencha o endereço: ${missingAddress.join(', ')}`,
      });
    }
  }

  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ message: 'Forma de pagamento não configurada' });
  }

  if ((paymentMethod === 'dinheiro' || paymentMethod === 'pagar_na_loja') && !isPickup) {
    return res.status(400).json({ message: 'Esta forma de pagamento só está disponível na retirada na loja' });
  }

  const pickupConfig = isPickup ? await getStorePickupConfig() : null;

  const customer = {
    customer_name,
    customer_email,
    customer_phone,
    customer_document,
    customer_zip_code: isPickup ? null : customer_zip_code,
    customer_address: isPickup
      ? `Retirada na loja — ${pickupConfig.address}`
      : address.customer_address,
    address_street: isPickup ? pickupConfig.address : address.address_street,
    address_number: isPickup ? '—' : address.address_number,
    address_complement: isPickup ? '' : address.address_complement,
    address_district: isPickup ? '' : address.address_district,
    address_city: isPickup ? 'Sacramento' : address.address_city,
    address_state: isPickup ? 'MG' : address.address_state,
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

  if (providerInfo.provider === 'pay_at_pickup') {
    await pool.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);

    const message = paymentMethod === 'dinheiro'
      ? 'Pedido registrado. Leve o valor em dinheiro na retirada.'
      : 'Pedido registrado. Pague na loja ao retirar seu pedido.';

    return res.json({
      type: 'pay_at_pickup',
      order_id: order.id,
      redirect_url: `/pagamento/retorno?pedido=${order.id}`,
      message,
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

router.get('/condicoes-pagamento', async (_req, res) => {
  try {
    res.json(await getPublicPaymentConditions());
  } catch (err) {
    console.error('Erro ao carregar condições de pagamento:', err);
    res.status(500).json({ message: 'Erro ao carregar condições de pagamento' });
  }
});

router.get('/metodos', requireAuth, async (req, res) => {
  try {
    const isPickup = req.query.pickup === 'true';
    const methods = await getAvailablePaymentMethods({ pickup: isPickup });
    const storePickup = await getStorePickupConfig();
    res.json({
      methods,
      store_pickup: storePickup,
      checkout_method: await getCheckoutPaymentMethod(),
    });
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

async function handleCieloWebhook(req, res, label) {
  try {
    const result = await applyCieloPaymentUpdate(pool, req.body);
    res.status(200).json(result);
  } catch (err) {
    console.error(`[Cielo] Erro na ${label}:`, err);
    res.status(err.status || 500).json({ message: err.message || 'Erro ao processar notificação' });
  }
}

/** URL de notificação — transação finalizada (POST ou JSON com consulta GET). */
router.post('/cielo/notificacao', (req, res) => handleCieloWebhook(req, res, 'notificação'));

/** URL de mudança de status — atualização de status do pedido. */
router.post('/cielo/mudanca-status', (req, res) => handleCieloWebhook(req, res, 'mudança de status'));

export default router;
