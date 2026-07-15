import { getCieloConfig } from './cieloConfig.js';

/** Cache do access_token OAuth2 (validade ~20 min). */
let tokenCache = {
  accessToken: null,
  expiresAt: 0,
};

function normalizeTransactionalPayload(data) {
  if (!data || typeof data !== 'object') return data;

  const payment = data.payment || data.Payment || {};
  const status = payment.status ?? payment.Status ?? data.payment_status ?? data.paymentStatus;

  return {
    ...data,
    order_number: data.order_number || data.orderNumber || data.merchantOrderNumber,
    checkout_cielo_order_number: data.checkout_cielo_order_number
      || data.checkoutOrderNumber
      || data.orderNumber,
    payment_status: status,
    authorization_code: data.authorization_code || payment.authorizationCode || payment.AuthorizationCode,
  };
}

/** Obtém access_token via OAuth2 (ClientId:ClientSecret em Basic). */
export async function getCieloAccessToken(config = null) {
  const cieloConfig = config || await getCieloConfig();

  if (!cieloConfig.clientId || !cieloConfig.clientSecret) {
    throw new Error('ClientID e ClientSecret da Cielo não configurados');
  }

  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  const credentials = Buffer.from(`${cieloConfig.clientId}:${cieloConfig.clientSecret}`).toString('base64');

  const response = await fetch(cieloConfig.tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  });

  const rawText = await response.text();
  let data = {};

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error('[Cielo] Token OAuth resposta inválida:', rawText.slice(0, 200));
      throw new Error('Resposta inválida ao obter token OAuth da Cielo');
    }
  }

  if (!response.ok) {
    console.error('[Cielo] Erro ao obter token OAuth:', response.status, data);
    throw new Error(data.error_description || data.message || 'Falha na autenticação OAuth da Cielo');
  }

  const accessToken = data.access_token || data.Access_token;
  const expiresIn = Number(data.expires_in || data.Expires_in || 1200);

  if (!accessToken) {
    throw new Error('Cielo não retornou access_token');
  }

  tokenCache = {
    accessToken,
    expiresAt: now + expiresIn * 1000,
  };

  return accessToken;
}

async function transactionalGet(path, config) {
  const accessToken = await getCieloAccessToken(config);
  const url = `${config.transactionalApiUrl}${path.replace(/^\//, '')}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[Cielo] Consulta transacional falhou:', response.status, url, text.slice(0, 200));
    return null;
  }

  return response.json();
}

/** Consulta transações pelo order_number (MerchantOrderNumber da loja). */
export async function queryCieloOrderByMerchantOrderNumber(orderNumber, config = null) {
  if (!orderNumber?.trim()) return null;

  const cieloConfig = config || await getCieloConfig();
  if (!cieloConfig.hasTransactionalCredentials) return null;

  const data = await transactionalGet(
    `orders?order_number=${encodeURIComponent(orderNumber.trim())}`,
    cieloConfig
  );

  if (!data) return null;

  if (Array.isArray(data)) {
    const latest = data[data.length - 1];
    if (!latest) return null;
    const checkoutNumber = latest.checkoutOrderNumber || latest.checkout_cielo_order_number;
    if (checkoutNumber) {
      return queryCieloOrderByCheckoutNumber(checkoutNumber, cieloConfig);
    }
    return normalizeTransactionalPayload(latest);
  }

  return normalizeTransactionalPayload(data);
}

/** Consulta transação pelo checkout_cielo_order_number. */
export async function queryCieloOrderByCheckoutNumber(checkoutOrderNumber, config = null) {
  if (!checkoutOrderNumber?.trim()) return null;

  const cieloConfig = config || await getCieloConfig();
  if (!cieloConfig.hasTransactionalCredentials) return null;

  const data = await transactionalGet(
    `orders?Checkout_Cielo_Order_Number=${encodeURIComponent(checkoutOrderNumber.trim())}`,
    cieloConfig
  );

  if (!data) {
    const fallback = await transactionalGet(
      `orders/${encodeURIComponent(checkoutOrderNumber.trim())}`,
      cieloConfig
    );
    return fallback ? normalizeTransactionalPayload(fallback) : null;
  }

  if (Array.isArray(data)) {
    return data.length ? normalizeTransactionalPayload(data[data.length - 1]) : null;
  }

  return normalizeTransactionalPayload(data);
}

/** Invalida cache do token (útil após erro 401). */
export function invalidateCieloTokenCache() {
  tokenCache = { accessToken: null, expiresAt: 0 };
}
