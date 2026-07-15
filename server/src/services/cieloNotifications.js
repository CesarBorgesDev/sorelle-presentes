import { getCieloConfig } from './cieloConfig.js';
import {
  queryCieloOrderByMerchantOrderNumber,
  queryCieloOrderByCheckoutNumber,
} from './cieloTransactional.js';
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

  // Modo POST (padrão): campos vêm direto no form-data
  if (config.notificationMethod !== 'json') {
    const hasStatus = body.payment_status !== undefined && body.payment_status !== null && body.payment_status !== '';
    if (hasStatus) return body;

    // Status ausente — consultar via API de Controle Transacional
    if (config.hasTransactionalCredentials) {
      const checkoutNumber = extractCieloPaymentId(body);
      const merchantOrderNumber = extractCieloMerchantOrderNumber(body);

      if (checkoutNumber) {
        const details = await queryCieloOrderByCheckoutNumber(checkoutNumber, config);
        if (details) return { ...body, ...details };
      }
      if (merchantOrderNumber) {
        const details = await queryCieloOrderByMerchantOrderNumber(merchantOrderNumber, config);
        if (details) return { ...body, ...details };
      }
    }

    return body;
  }

  // Modo JSON: preferir API de Controle Transacional; fallback para URL da notificação
  const merchantOrderNumber = extractCieloMerchantOrderNumber(body);
  const checkoutNumber = extractCieloPaymentId(body);

  if (config.hasTransactionalCredentials) {
    if (checkoutNumber) {
      const details = await queryCieloOrderByCheckoutNumber(checkoutNumber, config);
      if (details) return { ...body, ...details };
    }
    if (merchantOrderNumber) {
      const details = await queryCieloOrderByMerchantOrderNumber(merchantOrderNumber, config);
      if (details) return { ...body, ...details };
    }
  }

  const url = extractCieloNotificationUrl(body);
  if (url) {
    const merchantId = body.MerchantId || body.merchantId || config.merchantId;
    const details = await fetchCieloOrderFromUrl(url, merchantId);
    if (details) return { ...body, ...details };
  }

  return body;
}

async function findAndUpdateOrder(pool, payload) {
  const merchantOrderNumber = extractCieloMerchantOrderNumber(payload);
  const checkoutOrderNumber = extractCieloPaymentId(payload);

  if (!merchantOrderNumber && !checkoutOrderNumber) {
    const err = new Error('Notificação inválida: order_number ou checkout_cielo_order_number ausente');
    err.status = 400;
    throw err;
  }

  const paymentStatus = mapCieloPaymentStatus(payload);
  const isPaid = paymentStatus === 'pago';
  const authorizationCode = extractCieloAuthorizationCode(payload);
  const paymentId = checkoutOrderNumber;

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
    WHERE ($5::text IS NOT NULL AND gateway_order_number = $5)
       OR ($4::text IS NOT NULL AND cielo_payment_id = $4)
    RETURNING id, customer_email, payment_status`,
    [paymentStatus, isPaid, authorizationCode, paymentId, merchantOrderNumber]
  );

  return { result, merchantOrderNumber, checkoutOrderNumber, paymentStatus, isPaid };
}

export async function applyCieloPaymentUpdate(pool, body = {}) {
  const payload = await resolveCieloNotificationPayload(body);
  const { result, merchantOrderNumber, checkoutOrderNumber, paymentStatus, isPaid } = await findAndUpdateOrder(pool, payload);

  if (result.rows.length === 0) {
    console.warn('[Cielo] Pedido não encontrado:', {
      order_number: merchantOrderNumber,
      checkout_cielo_order_number: checkoutOrderNumber,
    });
    return {
      received: true,
      updated: false,
      order_number: merchantOrderNumber,
      checkout_cielo_order_number: checkoutOrderNumber,
    };
  }

  if (isPaid) {
    await pool.query(
      'DELETE FROM cart_items WHERE user_id = (SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1)',
      [result.rows[0].customer_email]
    );
  }

  console.info('[Cielo] Pedido atualizado:', {
    order_number: merchantOrderNumber,
    checkout_cielo_order_number: checkoutOrderNumber,
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

/** Reconsulta status na Cielo (throttle ~30s) para pedidos aguardando pagamento. */
export async function refreshCieloOrderStatus(pool, order) {
  if (!order || order.payment_status !== 'aguardando_pagamento') return order;

  const config = await getCieloConfig();
  if (!config.hasTransactionalCredentials) return order;

  const updatedAt = order.updated_date ? new Date(order.updated_date).getTime() : 0;
  if (Date.now() - updatedAt < 30_000) return order;

  let details = null;
  if (order.cielo_payment_id) {
    details = await queryCieloOrderByCheckoutNumber(order.cielo_payment_id, config);
  }
  if (!details && order.gateway_order_number) {
    details = await queryCieloOrderByMerchantOrderNumber(order.gateway_order_number, config);
  }
  if (!details) return order;

  const paymentStatus = mapCieloPaymentStatus(details);
  if (paymentStatus === order.payment_status) return order;

  const isPaid = paymentStatus === 'pago';
  const authorizationCode = extractCieloAuthorizationCode(details);
  const paymentId = extractCieloPaymentId(details) || order.cielo_payment_id;

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
    WHERE id = $5
    RETURNING *`,
    [paymentStatus, isPaid, authorizationCode, paymentId, order.id]
  );

  if (result.rows.length === 0) return order;

  if (isPaid) {
    await pool.query(
      'DELETE FROM cart_items WHERE user_id = (SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1)',
      [result.rows[0].customer_email]
    );
  }

  console.info('[Cielo] Status atualizado via consulta:', {
    order_id: order.id,
    payment_status: paymentStatus,
  });

  return result.rows[0];
}
