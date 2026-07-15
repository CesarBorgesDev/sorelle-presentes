/**
 * Status do Checkout Cielo / Link de Pagamento.
 * @see https://developercielo.github.io/manual/checkout-cielo
 */
const CHECKOUT_CIELO_STATUS = {
  1: 'aguardando_pagamento', // Pendente (boleto, Pix, QR)
  2: 'pago',                   // Pago
  3: 'recusado',               // Negado
  4: 'cancelado',              // Expirado
  5: 'cancelado',              // Cancelado
  6: 'aguardando_pagamento',   // Não finalizado
  7: 'pago',                   // Autorizado — tratado como pago conforme manual da loja
  10: 'aguardando_pagamento',  // Aguardando biometria facial
};

const TRANSACTIONAL_STATUS = {
  paid: 'pago',
  authorized: 'pago',
  denied: 'recusado',
  expired: 'cancelado',
  cancelled: 'cancelado',
  canceled: 'cancelado',
  voided: 'cancelado',
  pending: 'aguardando_pagamento',
  notfinished: 'aguardando_pagamento',
};

export function mapCieloPaymentStatus(body = {}) {
  const rawValue = body.payment_status
    ?? body.PaymentStatus
    ?? body.Status
    ?? body.status
    ?? body.payment?.status
    ?? body.Payment?.status;

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    if (body.paid === true) return 'pago';
    return 'aguardando_pagamento';
  }

  const numeric = Number(rawValue);
  if (!Number.isNaN(numeric) && CHECKOUT_CIELO_STATUS[numeric]) {
    return CHECKOUT_CIELO_STATUS[numeric];
  }

  const raw = String(rawValue).toLowerCase().trim();
  if (TRANSACTIONAL_STATUS[raw]) {
    return TRANSACTIONAL_STATUS[raw];
  }

  if (['paid', 'pago', 'paymentconfirmed', 'authorized', 'autorizado'].includes(raw)) {
    return 'pago';
  }
  if (['denied', 'negado', 'refused', 'recusado'].includes(raw)) {
    return 'recusado';
  }
  if (['voided', 'cancelled', 'canceled', 'cancelado', 'expired', 'expirado', 'refunded', 'estornado'].includes(raw)) {
    return 'cancelado';
  }
  if (['pending', 'pendente', 'notfinished', 'notfinalized', 'authorizedidpaypending'].includes(raw)) {
    return 'aguardando_pagamento';
  }

  return 'aguardando_pagamento';
}

export function extractCieloAuthorizationCode(body = {}) {
  return body.authorization_code
    || body.AuthorizationCode
    || body.authorizationCode
    || body.Payment?.AuthorizationCode
    || body.payment?.authorizationCode
    || null;
}

export function extractCieloPaymentId(body = {}) {
  return body.checkout_cielo_order_number
    || body.checkoutOrderNumber
    || body.Checkout_Cielo_Order_Number
    || body.PaymentId
    || body.payment_id
    || body.paymentId
    || body.Tid
    || body.tid
    || body.Payment?.PaymentId
    || body.payment?.payment_id
    || null;
}

export function extractCieloMerchantOrderNumber(body = {}) {
  return body.order_number
    || body.MerchantOrderNumber
    || body.merchantOrderNumber
    || body.OrderNumber
    || body.orderNumber
    || body.merchantOrderNumber
    || null;
}

export function extractCieloNotificationUrl(body = {}) {
  return body.Url
    || body.url
    || body.URL
    || null;
}
