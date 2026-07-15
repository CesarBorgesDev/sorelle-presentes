import { getSipagConfig } from './sipagConfig.js';
import { inquireSipagOrder } from './sipag.js';

const REFRESH_THROTTLE_MS = 30_000;
const lastRefreshByOrder = new Map();

export async function applySipagPaymentUpdate(pool, order, inquiry) {
  if (!order?.id || !inquiry?.paymentStatus) return order;
  if (order.payment_status === inquiry.paymentStatus) return order;

  const nextStatus = inquiry.paymentStatus === 'pago' ? 'confirmado' : order.status;

  const result = await pool.query(
    `UPDATE orders
     SET payment_status = $1,
         status = CASE WHEN $1 = 'pago' AND status = 'pendente' THEN 'confirmado' ELSE status END,
         sipag_authorization_code = COALESCE($2, sipag_authorization_code),
         sipag_payment_id = COALESCE($3, sipag_payment_id),
         updated_date = NOW()
     WHERE id = $4
     RETURNING *`,
    [
      inquiry.paymentStatus,
      inquiry.approvalCode || null,
      inquiry.ipgTransactionId || null,
      order.id,
    ]
  );

  const updated = result.rows[0] || order;

  if (inquiry.paymentStatus === 'pago') {
    await pool.query(
      `DELETE FROM cart_items
       WHERE user_id = (SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1)`,
      [updated.customer_email]
    );
  }

  return updated;
}

export async function refreshSipagOrderStatus(pool, order) {
  if (!order || order.payment_status !== 'aguardando_pagamento' || order.payment_gateway !== 'sipag') {
    return order;
  }

  const sipagOrderId = order.gateway_order_number || order.sipag_payment_id;
  if (!sipagOrderId) return order;

  const now = Date.now();
  const last = lastRefreshByOrder.get(order.id) || 0;
  if (now - last < REFRESH_THROTTLE_MS) return order;
  lastRefreshByOrder.set(order.id, now);

  const config = await getSipagConfig();
  if (!config.isReady) return order;

  try {
    const inquiry = await inquireSipagOrder(sipagOrderId, config);
    if (!inquiry?.paymentStatus) return order;
    return applySipagPaymentUpdate(pool, order, inquiry);
  } catch (err) {
    console.error('[SiPag] Erro ao reconsultar pedido:', err.message);
    return order;
  }
}
