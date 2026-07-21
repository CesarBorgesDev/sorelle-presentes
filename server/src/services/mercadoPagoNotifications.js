import crypto from 'crypto';
import { getMercadoPagoConfig } from './mercadoPagoConfig.js';
import {
  getMercadoPagoPayment,
  searchMercadoPagoPaymentsByExternalReference,
} from './mercadoPago.js';

const REFRESH_THROTTLE_MS = 30_000;
const lastRefreshByOrder = new Map();

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Valida x-signature do webhook Mercado Pago quando há secret configurado.
 * Formato: ts=...,v1=...
 * Manifest: id:[data.id];request-id:[x-request-id];ts:[ts];
 */
export function verifyMercadoPagoWebhookSignature({
  xSignature,
  xRequestId,
  dataId,
  secret,
}) {
  if (!secret?.trim()) return true;
  if (!xSignature?.trim()) return false;

  const parts = Object.fromEntries(
    String(xSignature)
      .split(',')
      .map((part) => part.trim().split('='))
      .filter((pair) => pair.length === 2)
  );

  const ts = parts.ts;
  const hash = parts.v1;
  if (!ts || !hash) return false;

  const manifest = `id:${dataId || ''};request-id:${xRequestId || ''};ts:${ts};`;
  const expected = crypto
    .createHmac('sha256', secret.trim())
    .update(manifest)
    .digest('hex');

  return timingSafeEqual(expected, hash);
}

export async function applyMercadoPagoPaymentUpdate(pool, order, paymentInfo) {
  if (!order?.id || !paymentInfo?.paymentStatus) return order;
  if (order.payment_status === paymentInfo.paymentStatus
    && String(order.mercado_pago_payment_id || '') === String(paymentInfo.id || '')) {
    return order;
  }

  const result = await pool.query(
    `UPDATE orders
     SET payment_status = $1,
         status = CASE
           WHEN $1 = 'pago' AND status = 'pendente' THEN 'confirmado'
           WHEN $1 = 'recusado' OR $1 = 'cancelado' THEN 'cancelado'
           ELSE status
         END,
         mercado_pago_payment_id = COALESCE($2, mercado_pago_payment_id),
         mercado_pago_preference_id = COALESCE($3, mercado_pago_preference_id),
         updated_date = NOW()
     WHERE id = $4
     RETURNING *`,
    [
      paymentInfo.paymentStatus,
      paymentInfo.id || null,
      paymentInfo.preferenceId || null,
      order.id,
    ]
  );

  const updated = result.rows[0] || order;

  if (paymentInfo.paymentStatus === 'pago') {
    await pool.query(
      `DELETE FROM cart_items
       WHERE user_id = (SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1)`,
      [updated.customer_email]
    );
  }

  return updated;
}

export async function refreshMercadoPagoOrderStatus(pool, order) {
  if (!order || order.payment_status !== 'aguardando_pagamento' || order.payment_gateway !== 'mercado_pago') {
    return order;
  }

  const now = Date.now();
  const last = lastRefreshByOrder.get(order.id) || 0;
  if (now - last < REFRESH_THROTTLE_MS) return order;
  lastRefreshByOrder.set(order.id, now);

  const config = await getMercadoPagoConfig();
  if (!config.isReady) return order;

  try {
    let paymentInfo = null;

    if (order.mercado_pago_payment_id) {
      paymentInfo = await getMercadoPagoPayment(order.mercado_pago_payment_id, config);
    }

    if (!paymentInfo) {
      const payments = await searchMercadoPagoPaymentsByExternalReference(order.id, config);
      // Prefer approved, otherwise most recent
      paymentInfo = payments.find((p) => p.paymentStatus === 'pago')
        || payments[0]
        || null;
    }

    if (!paymentInfo?.paymentStatus) return order;
    return applyMercadoPagoPaymentUpdate(pool, order, paymentInfo);
  } catch (err) {
    console.error('[MercadoPago] Erro ao reconsultar pedido:', err.message);
    return order;
  }
}

export async function handleMercadoPagoWebhook(pool, { body, query, headers }) {
  const config = await getMercadoPagoConfig();
  if (!config.isReady) {
    const err = new Error('Mercado Pago não configurado');
    err.status = 503;
    throw err;
  }

  const topic = body?.type || body?.action || query?.type || query?.topic || '';
  const dataId = body?.data?.id
    || body?.id
    || query?.['data.id']
    || query?.id
    || null;

  const signatureOk = verifyMercadoPagoWebhookSignature({
    xSignature: headers['x-signature'],
    xRequestId: headers['x-request-id'],
    dataId: dataId ? String(dataId) : '',
    secret: config.webhookSecret,
  });

  if (!signatureOk) {
    const err = new Error('Assinatura do webhook inválida');
    err.status = 401;
    throw err;
  }

  // Aceita ping / merchant_order sem falhar
  const isPayment = /payment/i.test(String(topic)) || Boolean(dataId && !/merchant_order/i.test(String(topic)));
  if (!isPayment && !dataId) {
    return { ok: true, ignored: true };
  }

  if (!dataId) {
    return { ok: true, ignored: true, reason: 'sem data.id' };
  }

  const paymentInfo = await getMercadoPagoPayment(dataId, config);
  if (!paymentInfo) {
    return { ok: true, ignored: true, reason: 'pagamento não encontrado' };
  }

  const orderId = paymentInfo.externalReference;
  if (!orderId) {
    return { ok: true, ignored: true, reason: 'sem external_reference' };
  }

  const result = await pool.query(
    `SELECT * FROM orders WHERE id = $1 AND payment_gateway = 'mercado_pago'`,
    [orderId]
  );

  if (result.rows.length === 0) {
    return { ok: true, ignored: true, reason: 'pedido não encontrado' };
  }

  const updated = await applyMercadoPagoPaymentUpdate(pool, result.rows[0], paymentInfo);

  return {
    ok: true,
    order_id: updated.id,
    payment_status: updated.payment_status,
    mercado_pago_payment_id: paymentInfo.id,
  };
}
