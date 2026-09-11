import { getMercadoPagoConfig } from './mercadoPagoConfig.js';

const REJECTED_MESSAGES = {
  cc_rejected_bad_filled_card_number: 'Número do cartão inválido.',
  cc_rejected_bad_filled_date: 'Data de validade inválida.',
  cc_rejected_bad_filled_other: 'Revise os dados do cartão.',
  cc_rejected_bad_filled_security_code: 'Código de segurança (CVV) inválido.',
  cc_rejected_blacklist: 'Não foi possível processar o pagamento com este cartão.',
  cc_rejected_call_for_authorize: 'O banco exige autorização. Entre em contato com o emissor do cartão.',
  cc_rejected_card_disabled: 'Cartão desabilitado. Entre em contato com o banco.',
  cc_rejected_card_error: 'Não foi possível processar o cartão. Tente outro ou use PIX.',
  cc_rejected_duplicated_payment: 'Pagamento duplicado. Verifique se a cobrança já foi feita.',
  cc_rejected_high_risk: 'Pagamento recusado por segurança. Tente outro meio.',
  cc_rejected_insufficient_amount: 'Saldo insuficiente.',
  cc_rejected_invalid_installments: 'Parcelamento não disponível para este cartão.',
  cc_rejected_max_attempts: 'Limite de tentativas excedido. Tente outro cartão ou PIX.',
  cc_rejected_other_reason: 'Pagamento recusado pelo banco. Tente outro cartão ou PIX.',
};

function extractMpErrorRaw(data) {
  const cause = Array.isArray(data?.cause) ? data.cause[0] : null;
  const candidates = [cause?.description, data?.message, data?.error];
  const raw = candidates.find((value) => {
    const text = String(value ?? '').trim();
    return text && text.toLowerCase() !== 'null' && text.toLowerCase() !== 'bad_request';
  });
  return String(raw || '').replace(/null$/i, '').trim();
}

function friendlyMercadoPagoError(data, httpStatus) {
  const raw = extractMpErrorRaw(data);
  const code = Number(data?.cause?.[0]?.code);
  const normalized = raw.toLowerCase();

  if (code === 13253 || /without key enabled for qr render/i.test(normalized)) {
    return 'A conta Mercado Pago ainda não tem chave PIX habilitada. No app ou site do Mercado Pago (a mesma conta do Access Token), vá em Pix, cadastre uma chave aleatória e tente finalizar de novo.';
  }

  return raw || `Erro Mercado Pago (${httpStatus})`;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Cliente';
  const lastName = parts.slice(1).join(' ') || firstName;
  return { firstName, lastName };
}

function mapPaymentStatus(mpStatus) {
  const status = String(mpStatus || '').toLowerCase();
  if (status === 'approved') return 'pago';
  if (status === 'rejected' || status === 'cancelled') return 'recusado';
  if (status === 'refunded' || status === 'charged_back') return 'cancelado';
  return 'aguardando_pagamento';
}

function userMessageForPayment(payment) {
  const detail = String(payment?.status_detail || '').toLowerCase();
  if (REJECTED_MESSAGES[detail]) return REJECTED_MESSAGES[detail];
  if (payment?.status === 'rejected' || payment?.status === 'cancelled') {
    return 'Pagamento recusado. Verifique os dados e tente novamente.';
  }
  return null;
}

function extractPix(payment) {
  const data = payment?.point_of_interaction?.transaction_data || {};
  const qrCode = data.qr_code || null;
  if (!qrCode) return null;
  return {
    qrCode,
    ticketUrl: data.ticket_url || null,
  };
}

function extractBoleto(payment) {
  const url = payment?.transaction_details?.external_resource_url
    || payment?.point_of_interaction?.transaction_data?.ticket_url
    || null;
  const digitableLine = payment?.barcode?.content
    || payment?.transaction_details?.digitable_line
    || null;
  if (!url && !digitableLine) return null;
  return { url, digitableLine };
}

function extractThreeDsUrl(payment) {
  return payment?.three_ds_info?.external_resource_url || null;
}

function normalizePayment(payment) {
  if (!payment) return null;
  const pix = extractPix(payment);
  const boleto = extractBoleto(payment);
  return {
    id: String(payment.id),
    status: payment.status,
    paymentStatus: mapPaymentStatus(payment.status),
    statusDetail: payment.status_detail || null,
    externalReference: payment.external_reference || null,
    preferenceId: payment.preference_id || null,
    paymentMethodId: payment.payment_method_id || null,
    paymentTypeId: payment.payment_type_id || null,
    authorizationCode: payment.authorization_code || null,
    userMessage: userMessageForPayment(payment),
    pixQrCode: pix?.qrCode || null,
    boletoUrl: boleto?.url || null,
    boletoDigitableLine: boleto?.digitableLine || null,
    threeDsUrl: extractThreeDsUrl(payment),
    raw: payment,
  };
}

function buildPayer(customer, { includeAddress = false } = {}) {
  const { firstName, lastName } = splitName(customer?.customer_name);
  const document = onlyDigits(customer?.customer_document);
  const payer = {
    email: String(customer?.customer_email || '').trim().toLowerCase() || undefined,
    first_name: firstName,
    last_name: lastName,
  };

  if (customer?.customer_phone) {
    payer.phone = { number: onlyDigits(customer.customer_phone).slice(0, 20) };
  }

  if (document.length === 11 || document.length === 14) {
    payer.identification = {
      type: document.length === 11 ? 'CPF' : 'CNPJ',
      number: document,
    };
  }

  if (includeAddress) {
    const zip = onlyDigits(customer?.customer_zip_code);
    payer.address = {
      zip_code: zip.slice(0, 8) || undefined,
      street_name: String(customer?.address_street || '').trim() || undefined,
      street_number: String(customer?.address_number || 'S/N').trim(),
      neighborhood: String(customer?.address_district || '').trim() || undefined,
      city: String(customer?.address_city || '').trim() || undefined,
      federal_unit: String(customer?.address_state || '').trim().slice(0, 2) || undefined,
    };
  }

  return payer;
}

function buildAdditionalInfo(order, customer) {
  const rawItems = typeof order.items === 'string'
    ? JSON.parse(order.items || '[]')
    : (Array.isArray(order.items) ? order.items : []);

  const items = rawItems.map((item) => ({
    id: String(item.product_id || item.id || 'item').slice(0, 256),
    title: String(item.product_name || 'Produto').slice(0, 256),
    quantity: Math.max(1, Number(item.quantity) || 1),
    unit_price: Number(Number(item.unit_price || item.price || 0).toFixed(2)),
  }));

  const { firstName, lastName } = splitName(customer?.customer_name);
  const zip = onlyDigits(customer?.customer_zip_code);
  const additionalInfo = {
    items,
    payer: {
      first_name: firstName,
      last_name: lastName,
    },
  };

  if (zip.length === 8) {
    additionalInfo.shipments = {
      receiver_address: {
        zip_code: zip,
        street_name: String(customer?.address_street || '').trim() || undefined,
        street_number: String(customer?.address_number || 'S/N').trim(),
        city_name: String(customer?.address_city || '').trim() || undefined,
        state_name: String(customer?.address_state || '').trim() || undefined,
      },
    };
  }

  return additionalInfo;
}

async function mpFetch(path, { method = 'GET', body, config, headers: extraHeaders } = {}) {
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
      ...extraHeaders,
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
    const message = friendlyMercadoPagoError(data, response.status);
    console.error('[MercadoPago] API error:', response.status, message, data?.cause || '');
    const err = new Error(message);
    err.status = response.status >= 500 ? 502 : 400;
    err.mpData = data;
    throw err;
  }

  return data;
}

export async function createMercadoPagoPayment({
  order,
  customer,
  paymentMethod,
  card,
  deviceId,
  maxInstallments,
  config: configOverride,
}) {
  const config = configOverride || await getMercadoPagoConfig();
  if (!config.isReady) {
    throw new Error('Mercado Pago não configurado. Informe o Access Token no admin.');
  }

  const orderTotal = Number(Number(order.total).toFixed(2));
  if (!(orderTotal > 0)) {
    throw new Error('Pedido sem valor válido para o Mercado Pago');
  }

  const needsAddress = paymentMethod === 'boleto';
  const payload = {
    transaction_amount: orderTotal,
    description: `Pedido Sorelle ${String(order.id).slice(0, 8)}`,
    external_reference: String(order.id),
    notification_url: config.webhookUrl,
    statement_descriptor: 'SORELLE',
    payer: buildPayer(customer, { includeAddress: needsAddress }),
    additional_info: buildAdditionalInfo(order, customer),
    metadata: {
      order_id: order.id,
      payment_method: paymentMethod,
    },
  };

  if (paymentMethod === 'pix') {
    payload.payment_method_id = 'pix';
    payload.date_of_expiration = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  } else if (paymentMethod === 'boleto') {
    payload.payment_method_id = 'bolbradesco';
  } else if (paymentMethod === 'cartao_credito' || paymentMethod === 'cartao_debito') {
    const token = String(card?.token || '').trim();
    const paymentMethodId = String(card?.paymentMethodId || '').trim();
    if (!token) {
      throw new Error('Não foi possível tokenizar o cartão. Recarregue a página e tente novamente.');
    }
    if (!paymentMethodId) {
      throw new Error('Não identificamos a bandeira do cartão. Confira o número e tente novamente.');
    }

    const installments = paymentMethod === 'cartao_debito'
      ? 1
      : Math.min(
        Math.max(1, Number(card?.installments) || 1),
        Math.min(12, Math.max(1, Number(maxInstallments) || 12)),
      );

    payload.token = token;
    payload.payment_method_id = paymentMethodId;
    payload.installments = installments;
    payload.binary_mode = true;
    payload.three_d_secure_mode = 'optional';

    const issuerId = card?.issuerId;
    if (issuerId !== undefined && issuerId !== null && String(issuerId).trim() !== '') {
      payload.issuer_id = Number(issuerId) || issuerId;
    }
  } else {
    throw new Error('Forma de pagamento não suportada pelo Mercado Pago');
  }

  const headers = {
    'X-Idempotency-Key': `order-${order.id}`,
  };
  const sessionId = String(deviceId || '').trim();
  if (sessionId) {
    headers['X-meli-session-id'] = sessionId;
  }

  const payment = await mpFetch('/v1/payments', {
    method: 'POST',
    body: payload,
    config,
    headers,
  });

  return normalizePayment(payment);
}

export async function getMercadoPagoPayment(paymentId, configOverride) {
  if (!paymentId) return null;
  const config = configOverride || await getMercadoPagoConfig();
  if (!config.isReady) return null;

  try {
    const payment = await mpFetch(`/v1/payments/${paymentId}`, { config });
    return normalizePayment(payment);
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
    return results.map((payment) => normalizePayment(payment)).filter(Boolean);
  } catch (err) {
    console.error('[MercadoPago] Erro ao buscar pagamentos:', externalReference, err.message);
    return [];
  }
}

export { mapPaymentStatus };
