/**
 * Post de Notificação da API E-commerce Cielo (API 3.0).
 *
 * A Cielo envia um POST JSON com { PaymentId, ChangeType } quando o status
 * de uma transação muda. A loja deve então consultar a transação na API de
 * consulta para obter o status atual.
 *
 * ChangeType: 1 = mudança de status do pagamento, 2 = recorrência criada,
 * 3 = mudança de status do antifraude, 4 = mudança de status de recorrência,
 * 5 = cancelamento negado, 6 = boleto.
 */

export function extractCieloPaymentId(body = {}) {
  return body.PaymentId
    || body.paymentId
    || body.payment_id
    || null;
}

export function extractCieloChangeType(body = {}) {
  const raw = body.ChangeType ?? body.changeType ?? body.change_type;
  const numeric = Number(raw);
  return Number.isNaN(numeric) ? null : numeric;
}
