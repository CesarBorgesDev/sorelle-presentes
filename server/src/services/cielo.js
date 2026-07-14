import { toCieloAddress } from '../utils/address.js';

const DEFAULT_CHECKOUT_URL = 'https://cieloecommerce.cielo.com.br/api/public/v1/orders/';
const MERCHANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function buildOrderNumber(orderId) {
  return orderId.replace(/-/g, '').slice(0, 20);
}

function toCents(value) {
  return Math.round(Number(value) * 100);
}

function normalizeCheckoutApiUrl(url) {
  const trimmed = String(url || DEFAULT_CHECKOUT_URL).trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

/** Extrai CheckoutUrl de todas as variantes conhecidas da resposta Cielo. */
export function extractCheckoutUrl(data) {
  if (!data || typeof data !== 'object') return null;

  const candidates = [
    data?.Settings?.CheckoutUrl,
    data?.Settings?.checkoutUrl,
    data?.settings?.CheckoutUrl,
    data?.settings?.checkoutUrl,
    data?.CheckoutUrl,
    data?.checkoutUrl,
    data?.Url,
    data?.url,
    data?.data?.Settings?.CheckoutUrl,
    data?.data?.settings?.checkoutUrl,
    data?.data?.checkoutUrl,
  ];

  return candidates.find((value) => typeof value === 'string' && value.trim())?.trim() || null;
}

function extractCieloErrorMessage(data) {
  if (!data || typeof data !== 'object') return null;

  const fromArray = Array.isArray(data.Errors)
    ? data.Errors.map((item) => item?.Message || item?.message).filter(Boolean)
    : [];

  return data.Message
    || data.message
    || data.Error
    || data.error
    || data.ErrorMessage
    || fromArray[0]
    || null;
}

export function validateCieloPayload(payload) {
  const items = payload?.Cart?.Items || [];
  const totalCents = items.reduce(
    (sum, item) => sum + Number(item.UnitPrice || 0) * Number(item.Quantity || 1),
    0
  );

  if (!items.length) {
    throw new Error('Carrinho vazio ao enviar para a Cielo');
  }
  if (totalCents <= 0) {
    throw new Error('O valor total do pedido deve ser maior que zero');
  }

  const identity = onlyDigits(payload?.Customer?.Identity);
  if (identity.length !== 11 && identity.length !== 14) {
    throw new Error('Informe um CPF ou CNPJ válido para pagamento com Cielo');
  }

  if (!payload?.Customer?.Email?.trim()) {
    throw new Error('E-mail do cliente é obrigatório para pagamento com Cielo');
  }
}

export function buildCieloPayload({ order, customer, returnUrl, config = {}, shipping = {}, isPickup = false }) {
  const softDescriptor = (config.softDescriptor || process.env.CIELO_SOFT_DESCRIPTOR || 'SORELLE').slice(0, 13);
  const maxInstallments = config.maxInstallments || 12;
  const shippingCost = Number(shipping.cost || order.shipping_cost || 0);
  const shippingDeadline = Number(shipping.deadlineDays || order.shipping_deadline_days || 7);
  const shippingLabel = shipping.serviceName || order.shipping_service_name || 'Entrega Sorelle';
  const cartItems = (order.items || []).map((item) => ({
    Name: String(item.product_name || 'Produto').slice(0, 128),
    Description: String(item.product_name || 'Produto Sorelle').slice(0, 256),
    UnitPrice: toCents(item.unit_price || 0),
    Quantity: Number(item.quantity || 1),
    Type: 'Asset',
    Sku: item.product_id ? String(item.product_id).slice(0, 32) : undefined,
  }));

  if (shippingCost > 0) {
    cartItems.push({
      Name: shippingLabel.slice(0, 128),
      Description: 'Frete Correios',
      UnitPrice: toCents(shippingCost),
      Quantity: 1,
      Type: 'Service',
    });
  }

  const address = toCieloAddress(customer);
  const zipCode = onlyDigits(customer.customer_zip_code).slice(0, 8) || '01310100';

  const shippingType = shippingCost > 0 && !isPickup
    ? 'Normal'
    : 'FreeWithoutShipping';

  return {
    OrderNumber: buildOrderNumber(order.id),
    SoftDescriptor: softDescriptor,
    Cart: { Items: cartItems },
    Shipping: {
      Type: shippingType,
      TargetZipCode: zipCode,
      Address: {
        ...address,
        Number: String(address.Number || 'S/N').replace(/[^\w\s/-]/g, '').slice(0, 15) || 'S/N',
        District: address.District || 'Centro',
      },
      Services: [
        {
          Name: shippingLabel.slice(0, 128),
          Price: toCents(shippingCost),
          Deadline: shippingDeadline,
        },
      ],
    },
    Payment: {
      MaxNumberOfInstallments: maxInstallments,
    },
    Customer: {
      Identity: onlyDigits(customer.customer_document),
      FullName: customer.customer_name,
      Email: customer.customer_email,
      Phone: onlyDigits(customer.customer_phone).slice(0, 11),
    },
    Options: {
      ReturnUrl: returnUrl,
    },
  };
}

export async function createCieloCheckout(payload, { merchantId, checkoutApiUrl } = {}) {
  const apiUrl = normalizeCheckoutApiUrl(
    checkoutApiUrl || process.env.CIELO_CHECKOUT_URL || DEFAULT_CHECKOUT_URL
  );
  const normalizedMerchantId = merchantId?.trim();

  if (!normalizedMerchantId) {
    throw new Error('MerchantId da Cielo não configurado. Acesse Configurações → Pagamento Cielo.');
  }
  if (!MERCHANT_ID_PATTERN.test(normalizedMerchantId)) {
    throw new Error('MerchantId da Cielo inválido. Use o GUID de 36 caracteres do painel Checkout Cielo.');
  }

  validateCieloPayload(payload);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      MerchantId: normalizedMerchantId,
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  let data = {};

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error('[Cielo] Resposta não-JSON:', {
        status: response.status,
        body: rawText.slice(0, 500),
        apiUrl,
      });
      throw new Error(
        'Cielo retornou resposta inválida. Verifique a URL da API e o MerchantId em Admin → Configurações → Cielo.'
      );
    }
  }

  if (!response.ok) {
    const detail = extractCieloErrorMessage(data) || rawText.slice(0, 200);
    console.error('[Cielo] Erro ao criar checkout:', { status: response.status, detail, data });
    throw new Error(detail || `Cielo retornou erro ${response.status}`);
  }

  const checkoutUrl = extractCheckoutUrl(data);
  if (!checkoutUrl) {
    const detail = extractCieloErrorMessage(data);
    console.error('[Cielo] Resposta sem CheckoutUrl:', {
      status: response.status,
      detail,
      keys: Object.keys(data),
      data,
    });
    throw new Error(
      detail
        || 'Cielo não retornou URL de pagamento. Confira no painel Cielo se cartão/PIX estão habilitados e se o Modo Teste está correto.'
    );
  }

  return { checkoutUrl, raw: data };
}

export { buildOrderNumber };
