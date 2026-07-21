import { getMercadoPagoConfig } from './mercadoPagoConfig.js';

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function buildPreferencePaymentMethods(paymentMethod, maxInstallments) {
  // Exclui tipos não escolhidos pelo cliente no checkout, quando possível.
  const excluded = [];

  if (paymentMethod === 'pix') {
    excluded.push(
      { id: 'credit_card' },
      { id: 'debit_card' },
      { id: 'ticket' },
    );
  } else if (paymentMethod === 'cartao_credito') {
    excluded.push(
      { id: 'debit_card' },
      { id: 'ticket' },
      { id: 'bank_transfer' },
    );
  } else if (paymentMethod === 'cartao_debito') {
    excluded.push(
      { id: 'credit_card' },
      { id: 'ticket' },
      { id: 'bank_transfer' },
    );
  } else if (paymentMethod === 'boleto') {
    excluded.push(
      { id: 'credit_card' },
      { id: 'debit_card' },
      { id: 'bank_transfer' },
    );
  }

  const result = {};
  if (excluded.length > 0) {
    result.excluded_payment_types = excluded;
  }
  if (maxInstallments && maxInstallments >= 1) {
    result.installments = Math.min(12, Math.max(1, Number(maxInstallments) || 1));
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function mapPaymentStatus(mpStatus) {
  const status = String(mpStatus || '').toLowerCase();
  if (status === 'approved') return 'pago';
  if (status === 'rejected' || status === 'cancelled') return 'recusado';
  if (status === 'refunded' || status === 'charged_back') return 'cancelado';
  // pending, in_process, in_mediation, authorized
  return 'aguardando_pagamento';
}

async function mpFetch(path, { method = 'GET', body, config } = {}) {
  const cfg = config || await getMercadoPagoConfig();
  if (!cfg.accessToken) {
    throw new Error('Mercado Pago não configurado. Informe o Access Token no admin.');
  }

  const response = await fetch(`${cfg.apiBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    const message = data?.message
      || data?.error
      || data?.cause?.[0]?.description
      || `Erro Mercado Pago (${response.status})`;
    console.error('[MercadoPago] API error:', response.status, message, data?.cause || '');
    const err = new Error(message);
    err.status = response.status;
    err.mpData = data;
    throw err;
  }

  return data;
}

export async function createMercadoPagoPreference({
  order,
  customer,
  paymentMethod,
  maxInstallments,
  config: configOverride,
}) {
  const config = configOverride || await getMercadoPagoConfig();
  if (!config.isReady) {
    throw new Error('Mercado Pago não configurado. Informe o Access Token no admin.');
  }

  const rawItems = typeof order.items === 'string'
    ? JSON.parse(order.items || '[]')
    : (Array.isArray(order.items) ? order.items : []);
  const items = rawItems.map((item) => ({
    id: String(item.product_id || item.id || 'item').slice(0, 256),
    title: String(item.product_name || 'Produto').slice(0, 256),
    quantity: Math.max(1, Number(item.quantity) || 1),
    unit_price: Number(Number(item.unit_price || item.price || 0).toFixed(2)),
    currency_id: 'BRL',
  }));

  const shippingCost = Number(order.shipping_cost) || 0;
  if (shippingCost > 0) {
    items.push({
      id: 'shipping',
      title: order.shipping_service_name || 'Frete',
      quantity: 1,
      unit_price: Number(shippingCost.toFixed(2)),
      currency_id: 'BRL',
    });
  }

  // Garante que o total da preferência bata com o total do pedido
  // (ex.: desconto PIX já aplicado no total).
  const itemsSum = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const orderTotal = Number(Number(order.total).toFixed(2));
  if (items.length > 0 && Math.abs(itemsSum - orderTotal) > 0.01) {
    const adjustment = Number((orderTotal - itemsSum).toFixed(2));
    items.push({
      id: 'adjustment',
      title: adjustment < 0 ? 'Desconto' : 'Ajuste',
      quantity: 1,
      unit_price: adjustment,
      currency_id: 'BRL',
    });
  }

  if (items.length === 0 || orderTotal <= 0) {
    throw new Error('Pedido sem valor válido para o Mercado Pago');
  }

  const returnUrl = `${config.frontendUrl}/pagamento/retorno?pedido=${order.id}`;
  const document = onlyDigits(customer?.customer_document);
  const payer = {
    name: String(customer?.customer_name || '').trim().slice(0, 256) || undefined,
    email: String(customer?.customer_email || '').trim().toLowerCase() || undefined,
    phone: customer?.customer_phone
      ? { number: onlyDigits(customer.customer_phone).slice(0, 20) }
      : undefined,
  };

  if (document.length === 11 || document.length === 14) {
    payer.identification = {
      type: document.length === 11 ? 'CPF' : 'CNPJ',
      number: document,
    };
  }

  const payload = {
    external_reference: String(order.id),
    items,
    payer,
    back_urls: {
      success: returnUrl,
      failure: returnUrl,
      pending: returnUrl,
    },
    auto_return: 'approved',
    notification_url: config.webhookUrl,
    statement_descriptor: 'SORELLE',
    metadata: {
      order_id: order.id,
      payment_method: paymentMethod,
    },
  };

  const paymentMethods = buildPreferencePaymentMethods(paymentMethod, maxInstallments);
  if (paymentMethods) {
    payload.payment_methods = paymentMethods;
  }

  const preference = await mpFetch('/checkout/preferences', {
    method: 'POST',
    body: payload,
    config,
  });

  const checkoutUrl = config.environment === 'production'
    ? (preference.init_point || preference.sandbox_init_point)
    : (preference.sandbox_init_point || preference.init_point);

  if (!checkoutUrl) {
    throw new Error('Mercado Pago não retornou URL de checkout');
  }

  return {
    preferenceId: preference.id,
    checkoutUrl,
    initPoint: preference.init_point,
    sandboxInitPoint: preference.sandbox_init_point,
  };
}

export async function getMercadoPagoPayment(paymentId, configOverride) {
  if (!paymentId) return null;
  const config = configOverride || await getMercadoPagoConfig();
  if (!config.isReady) return null;

  try {
    const payment = await mpFetch(`/v1/payments/${paymentId}`, { config });
    return {
      id: String(payment.id),
      status: payment.status,
      paymentStatus: mapPaymentStatus(payment.status),
      externalReference: payment.external_reference || null,
      preferenceId: payment.preference_id || null,
      paymentMethodId: payment.payment_method_id || null,
      paymentTypeId: payment.payment_type_id || null,
      statusDetail: payment.status_detail || null,
      raw: payment,
    };
  } catch (err) {
    console.error('[MercadoPago] Erro ao consultar pagamento:', paymentId, err.message);
    return null;
  }
}

export async function searchMercadoPagoPaymentsByExternalReference(externalReference, configOverride) {
  if (!externalReference) return [];
  const config = configOverride || await getMercadoPagoConfig();
  if (!config.isReady) return [];

  try {
    const data = await mpFetch(
      `/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&sort=date_created&criteria=desc`,
      { config }
    );
    const results = Array.isArray(data?.results) ? data.results : [];
    return results.map((payment) => ({
      id: String(payment.id),
      status: payment.status,
      paymentStatus: mapPaymentStatus(payment.status),
      externalReference: payment.external_reference || null,
      preferenceId: payment.preference_id || null,
      paymentMethodId: payment.payment_method_id || null,
      paymentTypeId: payment.payment_type_id || null,
      statusDetail: payment.status_detail || null,
      raw: payment,
    }));
  } catch (err) {
    console.error('[MercadoPago] Erro ao buscar pagamentos:', externalReference, err.message);
    return [];
  }
}

export { mapPaymentStatus };
