import { toCieloAddress } from '../utils/address.js';

/**
 * Cliente da API E-commerce Cielo (API 3.0).
 *
 * Transacional: POST {apiUrl}/1/sales/
 * Consulta:     GET  {queryApiUrl}/1/sales/{PaymentId}
 * Autenticação: headers MerchantId + MerchantKey.
 *
 * @see https://docs.cielo.com.br/ecommerce-cielo/reference/sobre-a-api
 * @see https://docs.cielo.com.br/ecommerce-cielo/reference/criar-pagamento-credito
 * @see https://docs.cielo.com.br/ecommerce-cielo/reference/qrcode-pix
 * @see https://docs.cielo.com.br/ecommerce-cielo/reference/boleto-api
 */

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/** MerchantOrderId aceita apenas a-z, A-Z, 0-9 (sem espaços/caracteres especiais). */
export function buildOrderNumber(orderId) {
  return String(orderId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
}

function toCents(value) {
  return Math.round(Number(value) * 100);
}

function sanitizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);
}

/** Detecta a bandeira pelo BIN (melhor esforço — a Cielo valida no autorizador). */
export function detectCardBrand(cardNumber) {
  const digits = onlyDigits(cardNumber);
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2(22[1-9]|2[3-9]\d|[3-6]\d{2}|7[01]\d|720))/.test(digits)) return 'Master';
  if (/^3[47]/.test(digits)) return 'Amex';
  if (/^(606282|3841)/.test(digits)) return 'Hipercard';
  if (/^(4011|4312|4389|4514|4573|5041|5066|5090|6277|6362|6363|650|6516|6550)/.test(digits)) return 'Elo';
  if (/^(30[1-5]|36|38)/.test(digits)) return 'Diners';
  return null;
}

function extractCieloErrors(data) {
  if (Array.isArray(data)) {
    return data.map((item) => item?.Message || item?.message).filter(Boolean).join(' | ') || null;
  }
  if (data && typeof data === 'object') {
    return data.Message || data.message || null;
  }
  return null;
}

/** Requisição autenticada à API E-commerce Cielo. */
export async function cieloRequest(path, { method = 'POST', body, config, useQueryApi = false } = {}) {
  const merchantId = config?.merchantId?.trim();
  const merchantKey = config?.merchantKey?.trim();

  if (!merchantId || !merchantKey) {
    throw new Error('Credenciais da Cielo não configuradas. Acesse Admin → Configurações → Cielo (MerchantId e MerchantKey).');
  }

  const baseUrl = useQueryApi ? config.queryApiUrl : config.apiUrl;
  const url = `${baseUrl}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      MerchantId: merchantId,
      MerchantKey: merchantKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const rawText = await response.text();
  let data = null;

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error('[Cielo] Resposta não-JSON:', {
        status: response.status,
        url,
        body: rawText.slice(0, 500),
      });
      throw new Error('A Cielo retornou uma resposta inválida. Tente novamente em instantes.');
    }
  }

  if (!response.ok) {
    const detail = extractCieloErrors(data);
    console.error('[Cielo] Erro na API:', { status: response.status, url, detail, data });

    if (response.status === 401) {
      throw new Error('Credenciais da Cielo recusadas (401). Confira MerchantId e MerchantKey no admin.');
    }
    throw new Error(detail || `Cielo retornou erro ${response.status}`);
  }

  return data;
}

function validateCustomerForCielo(customer) {
  const identity = onlyDigits(customer.customer_document);
  if (identity.length !== 11 && identity.length !== 14) {
    throw new Error('Informe um CPF ou CNPJ válido para pagamento com Cielo');
  }
  if (!customer.customer_email?.trim()) {
    throw new Error('E-mail do cliente é obrigatório para pagamento com Cielo');
  }
}

function buildCieloCustomer(customer, { withAddress = false } = {}) {
  const identity = onlyDigits(customer.customer_document);
  const result = {
    Name: sanitizeName(customer.customer_name) || 'Cliente Sorelle',
    Identity: identity,
    IdentityType: identity.length === 14 ? 'CNPJ' : 'CPF',
    Email: String(customer.customer_email || '').trim().slice(0, 255),
  };

  if (withAddress) {
    const address = toCieloAddress(customer);
    const zip = onlyDigits(customer.customer_zip_code).slice(0, 8);
    result.Address = {
      Street: address.Street,
      Number: address.Number || 'S/N',
      Complement: address.Complement,
      ZipCode: zip || '38070000',
      District: address.District || 'Centro',
      City: address.City,
      State: address.State,
      Country: 'BRA',
    };
  }

  return result;
}

/** Mapeia Payment.Status da API 3.0 para o status interno do pedido. */
export function mapCieloSaleStatus(status, paymentType = '') {
  const code = Number(status);
  const isCard = /card/i.test(String(paymentType));

  switch (code) {
    case 2: // PaymentConfirmed
      return 'pago';
    case 1: // Authorized — para cartão com captura, tratamos como pago; boleto/pix gerado segue aguardando
      return isCard ? 'pago' : 'aguardando_pagamento';
    case 3: // Denied
      return 'recusado';
    case 10: // Voided
    case 11: // Refunded
    case 13: // Aborted
      return 'cancelado';
    case 0: // NotFinished
    case 12: // Pending
    case 20: // Scheduled
    default:
      return 'aguardando_pagamento';
  }
}

/**
 * Cria transação de cartão de crédito com captura automática.
 * Retorna { paymentId, status, paymentStatus, authorizationCode, returnMessage, raw }.
 */
export async function createCieloCreditSale({ order, customer, card, config }) {
  validateCustomerForCielo(customer);

  const cardNumber = onlyDigits(card?.number);
  if (cardNumber.length < 13 || cardNumber.length > 19) {
    throw new Error('Número do cartão inválido');
  }
  if (!card?.holder?.trim()) {
    throw new Error('Informe o nome impresso no cartão');
  }

  const expMonth = onlyDigits(card?.expiration_month).padStart(2, '0');
  let expYear = onlyDigits(card?.expiration_year);
  if (expYear.length === 2) expYear = `20${expYear}`;
  if (Number(expMonth) < 1 || Number(expMonth) > 12 || expYear.length !== 4) {
    throw new Error('Validade do cartão inválida (use mês e ano)');
  }

  const securityCode = onlyDigits(card?.cvv);
  if (securityCode.length < 3 || securityCode.length > 4) {
    throw new Error('Código de segurança (CVV) inválido');
  }

  const installments = Math.min(
    Math.max(1, Number(card?.installments) || 1),
    config.maxInstallments || 12
  );

  const brand = detectCardBrand(cardNumber);

  const payload = {
    MerchantOrderId: buildOrderNumber(order.id),
    Customer: buildCieloCustomer(customer),
    Payment: {
      Type: 'CreditCard',
      Amount: toCents(order.total),
      Currency: 'BRL',
      Country: 'BRA',
      Installments: installments,
      Interest: 'ByMerchant',
      Capture: true,
      Authenticate: false,
      SoftDescriptor: config.softDescriptor || 'SORELLE',
      CreditCard: {
        CardNumber: cardNumber,
        Holder: sanitizeName(card.holder).slice(0, 25) || 'CLIENTE',
        ExpirationDate: `${expMonth}/${expYear}`,
        SecurityCode: securityCode,
        SaveCard: false,
        ...(brand ? { Brand: brand } : {}),
      },
    },
  };

  const data = await cieloRequest('/1/sales/', { body: payload, config });
  const payment = data?.Payment || {};

  console.info('[Cielo] Transação de crédito criada:', {
    orderNumber: payload.MerchantOrderId,
    paymentId: payment.PaymentId,
    status: payment.Status,
    returnCode: payment.ReturnCode,
    returnMessage: payment.ReturnMessage,
  });

  return {
    paymentId: payment.PaymentId || null,
    status: Number(payment.Status),
    paymentStatus: mapCieloSaleStatus(payment.Status, 'CreditCard'),
    authorizationCode: payment.AuthorizationCode || null,
    returnMessage: payment.ReturnMessage || null,
    raw: data,
  };
}

/**
 * Cria transação Pix — retorna QR Code (imagem base64 + copia e cola).
 * Retorna { paymentId, status, paymentStatus, qrCodeBase64, qrCodeString, raw }.
 */
export async function createCieloPixSale({ order, customer, config }) {
  validateCustomerForCielo(customer);

  const payload = {
    MerchantOrderId: buildOrderNumber(order.id),
    Customer: {
      Name: sanitizeName(customer.customer_name) || 'Cliente Sorelle',
      Identity: onlyDigits(customer.customer_document),
      IdentityType: onlyDigits(customer.customer_document).length === 14 ? 'CNPJ' : 'CPF',
    },
    Payment: {
      Type: 'Pix',
      Amount: toCents(order.total),
    },
  };

  const data = await cieloRequest('/1/sales/', { body: payload, config });
  const payment = data?.Payment || {};
  const paymentId = payment.PaymentId || payment.Paymentid || null;
  const qrCodeBase64 = payment.QrcodeBase64Image || payment.QrCodeBase64Image || null;
  const qrCodeString = payment.QrCodeString || payment.QrCodeText || null;

  if (!qrCodeString && !qrCodeBase64) {
    console.error('[Cielo] Pix criado sem QR Code:', { paymentId, keys: Object.keys(payment) });
    throw new Error(payment.ReturnMessage || 'A Cielo não retornou o QR Code Pix. Verifique se o Pix está habilitado na sua conta Cielo.');
  }

  console.info('[Cielo] Pix criado:', {
    orderNumber: payload.MerchantOrderId,
    paymentId,
    status: payment.Status,
  });

  return {
    paymentId,
    status: Number(payment.Status),
    paymentStatus: mapCieloSaleStatus(payment.Status, 'Pix'),
    qrCodeBase64,
    qrCodeString,
    raw: data,
  };
}

/**
 * Cria transação de boleto bancário.
 * Retorna { paymentId, status, paymentStatus, boletoUrl, digitableLine, barCodeNumber, raw }.
 */
export async function createCieloBoletoSale({ order, customer, config, provider = 'Bradesco2', expirationDays = 3 }) {
  validateCustomerForCielo(customer);

  const expiration = new Date();
  expiration.setDate(expiration.getDate() + expirationDays);
  const expirationDate = expiration.toISOString().slice(0, 10);

  const payload = {
    MerchantOrderId: buildOrderNumber(order.id),
    Customer: buildCieloCustomer(customer, { withAddress: true }),
    Payment: {
      Type: 'Boleto',
      Amount: toCents(order.total),
      Provider: provider,
      Assignor: config.softDescriptor || 'SORELLE',
      Demonstrative: `Pedido Sorelle Presentes`,
      ExpirationDate: expirationDate,
      Instructions: 'Não aceitar pagamento após a data de vencimento.',
    },
  };

  const data = await cieloRequest('/1/sales/', { body: payload, config });
  const payment = data?.Payment || {};
  const boletoUrl = payment.Url || null;

  if (!boletoUrl) {
    console.error('[Cielo] Boleto criado sem URL:', { keys: Object.keys(payment) });
    throw new Error(payment.ReturnMessage || 'A Cielo não retornou o boleto. Verifique se o boleto está habilitado na sua conta Cielo.');
  }

  console.info('[Cielo] Boleto criado:', {
    orderNumber: payload.MerchantOrderId,
    paymentId: payment.PaymentId,
    status: payment.Status,
  });

  return {
    paymentId: payment.PaymentId || null,
    status: Number(payment.Status),
    paymentStatus: mapCieloSaleStatus(payment.Status, 'Boleto'),
    boletoUrl,
    digitableLine: payment.DigitableLine || null,
    barCodeNumber: payment.BarCodeNumber || null,
    raw: data,
  };
}

/**
 * Consulta uma transação pelo PaymentId (API de consulta).
 * Retorna { paymentId, merchantOrderId, type, status, paymentStatus, authorizationCode, raw } ou null.
 */
export async function queryCieloSale(paymentId, config) {
  if (!paymentId?.trim()) return null;

  try {
    const data = await cieloRequest(`/1/sales/${paymentId.trim()}`, {
      method: 'GET',
      config,
      useQueryApi: true,
    });

    const payment = data?.Payment || {};
    return {
      paymentId: payment.PaymentId || paymentId,
      merchantOrderId: data?.MerchantOrderId || null,
      type: payment.Type || null,
      status: Number(payment.Status),
      paymentStatus: mapCieloSaleStatus(payment.Status, payment.Type),
      authorizationCode: payment.AuthorizationCode || null,
      raw: data,
    };
  } catch (err) {
    console.error('[Cielo] Erro ao consultar transação:', paymentId, err.message);
    return null;
  }
}
