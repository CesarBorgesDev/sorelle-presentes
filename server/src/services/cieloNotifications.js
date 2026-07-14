import { getCieloConfig } from './cieloConfig.js';
import {
  mapCieloPaymentStatus,
  extractCieloAuthorizationCode,
  extractCieloPaymentId,
  extractCieloMerchantOrderNumber,
  extractCieloNotificationUrl,
} from '../utils/cieloWebhook.js';

export async function fetchCieloOrderFromUrl(url, merchantId) {
  if (!url?.trim() || !merchantId?.trim()) return null;

  try {
    const response = await fetch(url.trim(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        MerchantId: merchantId.trim(),
      },
    });

    if (!response.ok) {
      console.error('[Cielo] Consulta de pedido falhou:', response.status, url);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error('[Cielo] Erro ao consultar pedido:', err.message);
    return null;
  }
}

export async function resolveCieloNotificationPayload(body = {}) {
  const config = await getCieloConfig();

  // Modo POST (padrão): campos vêm direto no form-data (order_number, payment_status, etc.)
  if (config.notificationMethod !== 'json') {
    return body;
  }

  // Modo JSON: Cielo envia Url para consulta GET dos detalhes da transação
  const url = extractCieloNotificationUrl(body);
  if (!url) return body;

  const merchantId = body.MerchantId || body.merchantId || config.merchantId;
  const details = await fetchCieloOrderFromUrl(url, merchantId);

  return details ? { ...body, ...details } : body;
}

export async function applyCieloPaymentUpdate(pool, body = {}) {
  const payload = await resolveCieloNotificationPayload(body);
  const merchantOrderNumber = extractCieloMerchantOrderNumber(payload);

  if (!merchantOrderNumber) {
    const err = new Error('Notificação inválida: order_number ausente');
    err.status = 400;
    throw err;
  }

  const paymentStatus = mapCieloPaymentStatus(payload);
  const isPaid = paymentStatus === 'pago';
  const authorizationCode = extractCieloAuthorizationCode(payload);
  const paymentId = extractCieloPaymentId(payload);

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
    RETURNING id, customer_email, payment_status`,
    [paymentStatus, isPaid, authorizationCode, paymentId, merchantOrderNumber]
  );

  if (result.rows.length === 0) {
    console.warn('[Cielo] Pedido não encontrado para order_number:', merchantOrderNumber);
    return { received: true, updated: false, order_number: merchantOrderNumber };
  }

  if (isPaid) {
    await pool.query(
      'DELETE FROM cart_items WHERE user_id = (SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1)',
      [result.rows[0].customer_email]
    );
  }

  console.info('[Cielo] Pedido atualizado:', {
    order_number: merchantOrderNumber,
    payment_status: paymentStatus,
    order_id: result.rows[0].id,
  });

  return {
    received: true,
    updated: true,
    order_id: result.rows[0].id,
    payment_status: paymentStatus,
  };
}
