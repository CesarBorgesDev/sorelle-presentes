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
    data?.data?.Settings?.CheckoutUrl,
    data?.data?.settings?.checkoutUrl,
    data?.data?.checkoutUrl,
  ];

  return candidates.find((value) => typeof value === 'string' && value.trim())?.trim() || null;
}

/** Tipos válidos conforme manual Checkout Cielo (FixedAmount, Free, WithoutShippingPickUp, etc.) */
export function resolveCieloShippingType({ isPickup = false, shippingCost = 0 } = {}) {
  if (isPickup) return 'WithoutShippingPickUp';
  if (Number(shippingCost) > 0) return 'FixedAmount';
  return 'Free';
}

export function isValidCieloCheckoutUrl(url) {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    const hostOk = parsed.hostname.includes('cieloecommerce.cielo.com.br');
    const pathOk = /checkoutui|transacional/i.test(`${parsed.pathname}${parsed.hash}`);
    return hostOk && pathOk;
  } catch {
    return false;
  }
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

  const phone = onlyDigits(payload?.Customer?.Phone);
  if (phone.length < 10 || phone.length > 11) {
    throw new Error('Informe um telefone válido com DDD (10 ou 11 dígitos) para pagamento com Cielo');
  }
}

export function buildCieloPayload({
  order,
  customer,
  returnUrl,
  config = {},
  shipping = {},
  isPickup = false,
  originZipCode = '',
}) {
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
  const targetZip = onlyDigits(customer.customer_zip_code).slice(0, 8);
  const sourceZip = onlyDigits(originZipCode).slice(0, 8) || '01310100';
  const shippingType = resolveCieloShippingType({ isPickup, shippingCost });
  const phone = onlyDigits(customer.customer_phone).slice(0, 11);

  const shippingBlock = {
    Type: shippingType,
    TargetZipCode: targetZip || sourceZip,
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
  };

  if (sourceZip) {
    shippingBlock.SourceZipCode = sourceZip;
  }

  return {
    OrderNumber: buildOrderNumber(order.id),
    SoftDescriptor: softDescriptor,
    Cart: { Items: cartItems },
    Shipping: shippingBlock,
    Payment: {
      MaxNumberOfInstallments: maxInstallments,
    },
    Customer: {
      Identity: onlyDigits(customer.customer_document),
      FullName: String(customer.customer_name || '').trim().slice(0, 288),
      Email: String(customer.customer_email || '').trim().slice(0, 64),
      Phone: phone,
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
  if (!checkoutUrl || !isValidCieloCheckoutUrl(checkoutUrl)) {
    const detail = extractCieloErrorMessage(data);
    console.error('[Cielo] Resposta sem CheckoutUrl válida:', {
      status: response.status,
      detail,
      checkoutUrl,
      keys: Object.keys(data),
      data,
    });
    throw new Error(
      detail
        || 'Cielo não retornou URL de pagamento válida. Confira MerchantId, meios de pagamento e Modo Teste no painel Cielo.'
    );
  }

  console.info('[Cielo] Checkout criado:', {
    orderNumber: payload.OrderNumber,
    shippingType: payload.Shipping?.Type,
    checkoutUrl,
  });

  return { checkoutUrl, raw: data };
}

export { buildOrderNumber };
