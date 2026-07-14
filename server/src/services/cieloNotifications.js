import { getCieloConfig } from './cieloConfig.js';
import { queryCieloSale } from './cielo.js';
import { extractCieloPaymentId, extractCieloChangeType } from '../utils/cieloWebhook.js';

/**
 * Processa o Post de Notificação da API E-commerce Cielo.
 *
 * Fluxo: a Cielo envia { PaymentId, ChangeType }. Consultamos a transação
 * na API de consulta e atualizamos o pedido correspondente
 * (por cielo_payment_id ou gateway_order_number = MerchantOrderId).
 */
export async function applyCieloPaymentUpdate(pool, body = {}) {
  const paymentId = extractCieloPaymentId(body);
  const changeType = extractCieloChangeType(body);

  if (!paymentId) {
    const err = new Error('Notificação inválida: PaymentId ausente');
    err.status = 400;
    throw err;
  }

  // Só mudanças de status de pagamento/boleto interessam à loja
  if (changeType !== null && ![1, 6].includes(changeType)) {
    return { received: true, updated: false, payment_id: paymentId, change_type: changeType };
  }

  const config = await getCieloConfig();
  if (!config.isReady) {
    const err = new Error('Cielo não configurada para processar notificações');
    err.status = 500;
    throw err;
  }

  const sale = await queryCieloSale(paymentId, config);
  if (!sale) {
    const err = new Error('Não foi possível consultar a transação na Cielo');
    err.status = 502;
    throw err;
  }

  const paymentStatus = sale.paymentStatus;
  const isPaid = paymentStatus === 'pago';

  const result = await pool.query(
    `UPDATE orders SET
      payment_status = $1,
      status = CASE
        WHEN $2 THEN 'confirmado'
        WHEN $1 = 'recusado' OR $1 = 'cancelado' THEN 'cancelado'
        ELSE status
      END,
      cielo_authorization_code = COALESCE($3, cielo_authorization_code),
      cielo_payment_id = COALESCE(cielo_payment_id, $4),
      updated_date = NOW()
    WHERE cielo_payment_id = $4
       OR ($5::text IS NOT NULL AND gateway_order_number = $5)
    RETURNING id, customer_email, payment_status`,
    [paymentStatus, isPaid, sale.authorizationCode, paymentId, sale.merchantOrderId]
  );

  if (result.rows.length === 0) {
    console.warn('[Cielo] Pedido não encontrado para PaymentId:', paymentId, 'MerchantOrderId:', sale.merchantOrderId);
    return { received: true, updated: false, payment_id: paymentId };
  }

  if (isPaid) {
    await pool.query(
      'DELETE FROM cart_items WHERE user_id = (SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1)',
      [result.rows[0].customer_email]
    );
  }

  console.info('[Cielo] Pedido atualizado via notificação:', {
    payment_id: paymentId,
    cielo_status: sale.status,
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
