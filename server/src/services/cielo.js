import { toCieloAddress } from '../utils/address.js';

const DEFAULT_CHECKOUT_URL = 'https://cieloecommerce.cielo.com.br/api/public/v1/orders/';

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function buildOrderNumber(orderId) {
  return orderId.replace(/-/g, '').slice(0, 20);
}

function toCents(value) {
  return Math.round(Number(value) * 100);
}

export function buildCieloPayload({ order, customer, returnUrl, config = {}, shipping = {} }) {
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

  return {
    OrderNumber: buildOrderNumber(order.id),
    SoftDescriptor: softDescriptor,
    Cart: { Items: cartItems },
    Shipping: {
      Type: shippingCost > 0 ? 'Normal' : 'FreeWithoutShipping',
      TargetZipCode: zipCode,
      Address: address,
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
  const apiUrl = checkoutApiUrl || process.env.CIELO_CHECKOUT_URL || DEFAULT_CHECKOUT_URL;

  if (!merchantId?.trim()) {
    throw new Error('MerchantId da Cielo não configurado. Acesse Configurações → Pagamento Cielo.');
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      MerchantId: merchantId.trim(),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = data?.Message || data?.message || JSON.stringify(data).slice(0, 200);
    throw new Error(detail || `Cielo retornou erro ${response.status}`);
  }

  const checkoutUrl = data?.Settings?.CheckoutUrl
    || data?.CheckoutUrl
    || data?.checkoutUrl;

  if (!checkoutUrl) {
    throw new Error('Cielo não retornou URL de pagamento');
  }

  return { checkoutUrl, raw: data };
}

export { buildOrderNumber };
