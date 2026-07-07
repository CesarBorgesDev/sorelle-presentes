export function mapCieloPaymentStatus(body = {}) {
  const raw = String(
    body.payment_status
    || body.PaymentStatus
    || body.Status
    || body.status
    || ''
  ).toLowerCase();

  if (body.paid === true || raw === 'paid' || raw === 'pago' || raw === '2' || raw === 'authorized') {
    return 'pago';
  }
  if (raw === 'denied' || raw === 'recusado' || raw === 'refused' || raw === '3') {
    return 'recusado';
  }
  if (raw === 'cancelled' || raw === 'cancelado' || raw === 'canceled' || raw === '10') {
    return 'cancelado';
  }
  return 'aguardando_pagamento';
}

export function extractCieloAuthorizationCode(body = {}) {
  return body.AuthorizationCode
    || body.authorization_code
    || body.authorizationCode
    || body.Payment?.AuthorizationCode
    || body.payment?.authorization_code
    || null;
}

export function extractCieloPaymentId(body = {}) {
  return body.PaymentId
    || body.payment_id
    || body.paymentId
    || body.Tid
    || body.tid
    || body.Payment?.PaymentId
    || body.payment?.payment_id
    || null;
}

export function extractCieloMerchantOrderNumber(body = {}) {
  return body.MerchantOrderNumber
    || body.merchantOrderNumber
    || body.order_number
    || null;
}
