import { config } from '../config/env.js';
import pool from '../config/db.js';
import { getSetting, setSetting } from './settings.js';
import {
  getCorreiosConfig,
  fetchAddressByCep,
  buildPackageFromProducts,
} from './correios.js';
import { parseOrderRecipientAddress } from '../utils/address.js';

const REQUEST_TIMEOUT_MS = 20000;
const APP_NAME = 'Sorelle Presentes';

export const MELHOR_ENVIO_SCOPES = [
  'shipping-calculate',
  'cart-read',
  'cart-write',
  'shipping-checkout',
  'shipping-generate',
  'shipping-print',
  'shipping-tracking',
  'companies-read',
  'users-read',
].join(' ');

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function truncate(value, max) {
  return String(value || '').trim().slice(0, max);
}

export function getMelhorEnvioApiBase(environment = 'sandbox') {
  return environment === 'production'
    ? 'https://melhorenvio.com.br'
    : 'https://sandbox.melhorenvio.com.br';
}

export function buildMelhorEnvioServiceCode(companyId, serviceId) {
  return `me:${companyId}:${serviceId}`;
}

export function parseMelhorEnvioServiceCode(code) {
  const raw = String(code || '').trim();
  const match = /^me:(\d+):(\d+)$/i.exec(raw);
  if (!match) return null;
  return {
    company_id: Number(match[1]),
    service_id: Number(match[2]),
  };
}

export function isMelhorEnvioServiceCode(code) {
  return Boolean(parseMelhorEnvioServiceCode(code));
}

function defaultRedirectUri() {
  const base = (config.appPublicUrl || '').replace(/\/$/, '');
  if (!base) return '';
  return `${base}/api/melhor-envio/callback`;
}

export async function getMelhorEnvioConfig() {
  const enabledSetting = await getSetting('melhor_envio_enabled');
  const enabled = enabledSetting === 'true'
    || (enabledSetting == null && process.env.MELHOR_ENVIO_ENABLED === 'true');

  const environmentRaw = (
    (await getSetting('melhor_envio_environment'))
    || process.env.MELHOR_ENVIO_ENVIRONMENT
    || 'sandbox'
  ).trim().toLowerCase();
  const environment = environmentRaw === 'production' ? 'production' : 'sandbox';

  const clientId = (
    (await getSetting('melhor_envio_client_id'))
    || process.env.MELHOR_ENVIO_CLIENT_ID
    || ''
  ).trim();
  const clientSecret = (
    (await getSetting('melhor_envio_client_secret'))
    || process.env.MELHOR_ENVIO_CLIENT_SECRET
    || ''
  ).trim();
  const redirectUri = (
    (await getSetting('melhor_envio_redirect_uri'))
    || process.env.MELHOR_ENVIO_REDIRECT_URI
    || defaultRedirectUri()
  ).trim();
  const userAgentEmail = (
    (await getSetting('melhor_envio_user_agent_email'))
    || process.env.MELHOR_ENVIO_USER_AGENT_EMAIL
    || (await getSetting('correios_sender_email'))
    || 'contato@sorellepresentes.com.br'
  ).trim();

  const accessToken = ((await getSetting('melhor_envio_access_token')) || '').trim();
  const refreshToken = ((await getSetting('melhor_envio_refresh_token')) || '').trim();
  const tokenExpiresAtRaw = await getSetting('melhor_envio_token_expires_at');
  const tokenExpiresAt = tokenExpiresAtRaw ? Number(tokenExpiresAtRaw) : null;

  const hasApp = Boolean(clientId && clientSecret && redirectUri);
  const connected = Boolean(accessToken && refreshToken);
  const isReady = Boolean(enabled && hasApp && connected);

  return {
    enabled,
    environment,
    clientId,
    clientSecret,
    redirectUri,
    userAgentEmail,
    accessToken,
    refreshToken,
    tokenExpiresAt: Number.isFinite(tokenExpiresAt) ? tokenExpiresAt : null,
    hasApp,
    connected,
    isReady,
    apiBase: getMelhorEnvioApiBase(environment),
  };
}

function buildUserAgent(email) {
  return `${APP_NAME} (${email || 'contato@sorellepresentes.com.br'})`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Melhor Envio demorou para responder. Tente novamente.');
    }
    throw new Error('Não foi possível conectar ao Melhor Envio');
  } finally {
    clearTimeout(timer);
  }
}

async function parseErrorBody(response) {
  try {
    const body = await response.json();
    if (typeof body?.message === 'string') return body.message;
    if (typeof body?.error === 'string') return body.error;
    if (typeof body?.error_description === 'string') return body.error_description;
    if (Array.isArray(body?.errors) && body.errors.length) {
      return body.errors.map((e) => e.message || e).join('; ');
    }
    if (body && typeof body === 'object') {
      const first = Object.values(body).flat?.() || Object.values(body);
      if (Array.isArray(first) && first[0]) return String(first[0]);
    }
    return JSON.stringify(body).slice(0, 300);
  } catch {
    return '';
  }
}

export async function saveMelhorEnvioTokens({
  accessToken,
  refreshToken,
  expiresIn,
}) {
  if (!accessToken) throw new Error('Melhor Envio: access_token ausente');
  await setSetting('melhor_envio_access_token', accessToken);
  if (refreshToken) {
    await setSetting('melhor_envio_refresh_token', refreshToken);
  }
  const expiresInSec = Number(expiresIn) || 30 * 24 * 60 * 60;
  const expiresAt = Date.now() + Math.max(60, expiresInSec - 120) * 1000;
  await setSetting('melhor_envio_token_expires_at', String(expiresAt));
  return expiresAt;
}

export async function clearMelhorEnvioTokens() {
  await setSetting('melhor_envio_access_token', '');
  await setSetting('melhor_envio_refresh_token', '');
  await setSetting('melhor_envio_token_expires_at', '');
}

export function buildAuthorizeUrl(cfg = null) {
  const configPromise = cfg ? Promise.resolve(cfg) : getMelhorEnvioConfig();
  return configPromise.then((c) => {
    if (!c.clientId || !c.redirectUri) {
      throw new Error('Configure Client ID e Redirect URI do Melhor Envio antes de conectar.');
    }
    const params = new URLSearchParams({
      client_id: c.clientId,
      redirect_uri: c.redirectUri,
      response_type: 'code',
      scope: MELHOR_ENVIO_SCOPES,
      state: `sorelle-${Date.now()}`,
    });
    return `${c.apiBase}/oauth/authorize?${params.toString()}`;
  });
}

async function requestToken(cfg, body) {
  const response = await fetchWithTimeout(`${cfg.apiBase}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': buildUserAgent(cfg.userAgentEmail),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await parseErrorBody(response);
    throw new Error(detail || `Melhor Envio: falha ao obter token (${response.status})`);
  }

  return response.json();
}

export async function exchangeAuthorizationCode(code) {
  const cfg = await getMelhorEnvioConfig();
  if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
    throw new Error('App Melhor Envio incompleto (Client ID/Secret/Redirect URI).');
  }
  if (!code) throw new Error('Código de autorização ausente');

  const data = await requestToken(cfg, {
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    code: String(code).trim(),
  });

  await saveMelhorEnvioTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  });

  return data;
}

export async function refreshAccessToken(cfg = null) {
  const c = cfg || await getMelhorEnvioConfig();
  if (!c.refreshToken) {
    throw new Error('Melhor Envio desconectado. Conecte novamente em Configurações → Frete.');
  }
  if (!c.clientId || !c.clientSecret) {
    throw new Error('Client ID/Secret do Melhor Envio não configurados.');
  }

  const data = await requestToken(c, {
    grant_type: 'refresh_token',
    client_id: c.clientId,
    client_secret: c.clientSecret,
    refresh_token: c.refreshToken,
  });

  await saveMelhorEnvioTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || c.refreshToken,
    expiresIn: data.expires_in,
  });

  return {
    ...c,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || c.refreshToken,
  };
}

async function ensureAccessToken(cfg) {
  let current = cfg || await getMelhorEnvioConfig();
  if (!current.accessToken) {
    throw new Error('Melhor Envio não conectado. Autorize o app em Configurações → Frete.');
  }

  const expiresSoon = current.tokenExpiresAt && current.tokenExpiresAt < Date.now() + 60_000;
  if (expiresSoon && current.refreshToken) {
    current = await refreshAccessToken(current);
  }
  return current;
}

export async function melhorEnvioFetch(path, options = {}) {
  let cfg = await ensureAccessToken();
  const url = path.startsWith('http') ? path : `${cfg.apiBase}${path}`;

  const doFetch = async (token) => fetchWithTimeout(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': buildUserAgent(cfg.userAgentEmail),
      ...(options.headers || {}),
    },
  });

  let response = await doFetch(cfg.accessToken);

  if (response.status === 401 && cfg.refreshToken) {
    cfg = await refreshAccessToken(cfg);
    response = await doFetch(cfg.accessToken);
  }

  return response;
}

function mapQuoteOption(row) {
  if (!row || row.error) return null;
  const serviceId = row.id;
  const companyId = row.company?.id;
  if (serviceId == null || companyId == null) return null;

  const price = roundMoney(row.custom_price ?? row.price);
  if (!Number.isFinite(price) || price <= 0) return null;

  const deadline = Number(row.custom_delivery_time ?? row.delivery_time);
  const companyName = row.company?.name || 'Melhor Envio';
  const serviceName = row.name || 'Frete';
  const label = `${companyName} ${serviceName}`.replace(/\s+/g, ' ').trim();

  const serviceCode = buildMelhorEnvioServiceCode(companyId, serviceId);

  return {
    id: serviceCode,
    service_code: serviceCode,
    label: truncate(label, 50) || 'Melhor Envio',
    price,
    deadline_days: Number.isFinite(deadline) && deadline > 0 ? Math.round(deadline) : 7,
    available: true,
    meta: {
      provider: 'melhor_envio',
      company_id: companyId,
      service_id: serviceId,
      company_name: companyName,
      service_name: serviceName,
    },
  };
}

/**
 * Cotação Melhor Envio — retorna lista de opções no formato do checkout.
 */
export async function quoteMelhorEnvioShipping({
  destinationZip,
  packageInfo,
  invoiceValue = 0,
  originZip = null,
  config: cfgIn = null,
}) {
  const cfg = cfgIn || await getMelhorEnvioConfig();
  if (!cfg.enabled) return [];
  if (!cfg.isReady) {
    throw new Error('Melhor Envio não está pronto (habilite, configure o app e conecte OAuth).');
  }

  const correios = await getCorreiosConfig();
  const fromZip = onlyDigits(originZip || correios.originZip).slice(0, 8);
  const toZip = onlyDigits(destinationZip).slice(0, 8);
  if (fromZip.length !== 8 || toZip.length !== 8) {
    throw new Error('CEP de origem ou destino inválido para Melhor Envio');
  }

  const weight = Math.max(0.1, Number(packageInfo?.weightKg) || 0.3);
  const insurance = roundMoney(Math.max(1, Number(invoiceValue) || 1));

  const payload = {
    from: { postal_code: fromZip },
    to: { postal_code: toZip },
    volumes: [{
      height: Math.max(1, Math.round(Number(packageInfo?.height) || 10)),
      width: Math.max(1, Math.round(Number(packageInfo?.width) || 15)),
      length: Math.max(1, Math.round(Number(packageInfo?.length) || 20)),
      weight,
      insurance,
    }],
    options: {
      receipt: false,
      own_hand: false,
    },
  };

  const response = await melhorEnvioFetch('/api/v2/me/shipment/calculate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await parseErrorBody(response);
    throw new Error(detail || `Melhor Envio: erro na cotação (${response.status})`);
  }

  const data = await response.json();
  const rows = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
  return rows.map(mapQuoteOption).filter(Boolean);
}

async function getSenderForLabel() {
  const correios = await getCorreiosConfig();
  const zip = onlyDigits(correios.originZip).slice(0, 8);
  let street = truncate((await getSetting('correios_sender_street')) || '', 100);
  let number = truncate((await getSetting('correios_sender_number')) || 'S/N', 20);
  let complement = truncate((await getSetting('correios_sender_complement')) || '', 50);
  let district = truncate((await getSetting('correios_sender_district')) || '', 50);
  let city = truncate((await getSetting('correios_sender_city')) || '', 50);
  let state = truncate((await getSetting('correios_sender_state')) || '', 2).toUpperCase();
  const email = truncate(
    (await getSetting('correios_sender_email')) || 'contato@sorellepresentes.com.br',
    255
  );
  const name = truncate(
    (await getSetting('correios_sender_name')) || 'Sorelle Presentes',
    100
  );
  const phone = onlyDigits((await getSetting('correios_sender_phone')) || '');
  const cnpj = onlyDigits((await getSetting('correios_sender_cnpj')) || '');

  if (zip.length === 8 && (!street || !city || !district || !state)) {
    try {
      const fromCep = await fetchAddressByCep(zip);
      if (!street && fromCep.street) street = truncate(fromCep.street, 100);
      if (!district && fromCep.district) district = truncate(fromCep.district, 50);
      if (!city && fromCep.city) city = truncate(fromCep.city, 50);
      if (!state && fromCep.state) state = truncate(fromCep.state, 2).toUpperCase();
    } catch {
      // ViaCEP opcional
    }
  }

  return {
    name,
    email,
    phone: phone || '11000000000',
    company_document: cnpj,
    document: '',
    state_register: 'ISENTO',
    address: street || 'Rua não configurada',
    complement,
    number: number || 'S/N',
    district: district || 'Centro',
    city: city || 'São Paulo',
    postal_code: zip,
    state_abbr: state || 'SP',
  };
}

function extractDocumentFromOrder(order) {
  const candidates = [
    order.customer_document,
    order.document,
  ];
  for (const c of candidates) {
    const digits = onlyDigits(c);
    if (digits.length === 11 || digits.length === 14) return digits;
  }
  const notes = String(order.notes || '');
  const match = notes.match(/(?:CPF|CNPJ|DOC)[:\s]*([\d.\-\/]+)/i);
  if (match) {
    const digits = onlyDigits(match[1]);
    if (digits.length === 11 || digits.length === 14) return digits;
  }
  return '';
}

async function resolveRecipientDocument(order) {
  let doc = extractDocumentFromOrder(order);
  if (doc) return doc;

  if (order.customer_email) {
    try {
      const result = await pool.query(
        'SELECT document FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [order.customer_email]
      );
      doc = onlyDigits(result.rows[0]?.document);
      if (doc.length === 11 || doc.length === 14) return doc;
    } catch {
      // ignore
    }
  }
  return '';
}

async function buildPackageFromOrder(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const productIds = items.map((item) => item.product_id).filter(Boolean);
  let productsById = new Map();
  if (productIds.length > 0) {
    const result = await pool.query(
      'SELECT id, weight_kg, length_cm, width_cm, height_cm FROM products WHERE id = ANY($1)',
      [productIds]
    );
    productsById = new Map(result.rows.map((row) => [row.id, row]));
  }

  const cartLike = items.map((item) => {
    const product = productsById.get(item.product_id) || {};
    return {
      quantity: item.quantity || 1,
      weight_kg: product.weight_kg,
      length_cm: product.length_cm,
      width_cm: product.width_cm,
      height_cm: product.height_cm,
      price: item.unit_price ?? item.price,
    };
  });

  const correios = await getCorreiosConfig();
  return buildPackageFromProducts(cartLike, correios);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fluxo completo: cart → checkout → generate → print
 */
export async function generateMelhorEnvioLabel(order) {
  const cfg = await getMelhorEnvioConfig();
  if (!cfg.isReady) {
    throw new Error('Melhor Envio não está pronto. Conecte o app em Configurações → Frete.');
  }

  const parsed = parseMelhorEnvioServiceCode(order.shipping_service_code);
  if (!parsed) {
    throw new Error('Este pedido não usa frete Melhor Envio (service_code me:…).');
  }

  const recipient = parseOrderRecipientAddress(order);
  const zip = onlyDigits(recipient.zip).slice(0, 8);
  if (zip.length !== 8) {
    throw new Error('CEP do destinatário inválido no pedido.');
  }
  if (!recipient.street || !recipient.city || !recipient.state) {
    throw new Error('Endereço do destinatário incompleto no pedido.');
  }

  const document = await resolveRecipientDocument(order);
  if (!document) {
    throw new Error('CPF/CNPJ do destinatário não encontrado. Atualize o cadastro do cliente.');
  }

  const sender = await getSenderForLabel();
  if (!sender.company_document || sender.company_document.length !== 14) {
    throw new Error('CNPJ do remetente não configurado (Frete → Remetente).');
  }
  if (onlyDigits(sender.postal_code).length !== 8) {
    throw new Error('CEP de origem não configurado.');
  }

  const packageInfo = await buildPackageFromOrder(order);
  const insurance = roundMoney(Math.max(1, Number(order.subtotal) || Number(order.total) || 1));
  const products = (Array.isArray(order.items) ? order.items : []).map((item, idx) => ({
    name: truncate(item.product_name || `Produto ${idx + 1}`, 80),
    quantity: String(item.quantity || 1),
    unitary_value: String(roundMoney(item.unit_price ?? item.price ?? 0) || '1.00'),
  }));
  if (products.length === 0) {
    products.push({
      name: 'Pedido Sorelle Presentes',
      quantity: '1',
      unitary_value: String(insurance),
    });
  }

  const cartPayload = {
    service: parsed.service_id,
    from: {
      name: sender.name,
      email: sender.email,
      phone: sender.phone,
      document: '',
      company_document: sender.company_document,
      state_register: sender.state_register || 'ISENTO',
      address: sender.address,
      complement: sender.complement,
      number: sender.number,
      district: sender.district,
      city: sender.city,
      postal_code: sender.postal_code,
      state_abbr: sender.state_abbr,
    },
    to: {
      name: truncate(order.customer_name || 'Destinatário', 100),
      email: truncate(order.customer_email || sender.email, 255),
      phone: onlyDigits(order.customer_phone) || '11000000000',
      document: document.length === 11 ? document : '',
      company_document: document.length === 14 ? document : '',
      state_register: 'ISENTO',
      address: recipient.street,
      complement: recipient.complement || '',
      number: recipient.number || 'S/N',
      district: recipient.district || 'Centro',
      city: recipient.city,
      postal_code: zip,
      country_id: 'BR',
      state_abbr: recipient.state,
    },
    products,
    volumes: [{
      height: Math.max(1, Math.round(Number(packageInfo.height) || 10)),
      width: Math.max(1, Math.round(Number(packageInfo.width) || 15)),
      length: Math.max(1, Math.round(Number(packageInfo.length) || 20)),
      weight: Math.max(0.1, Number(packageInfo.weightKg) || 0.3),
    }],
    options: {
      platform: APP_NAME,
      reminder: `Pedido ${String(order.id || '').slice(0, 8)}`,
      insurance_value: insurance,
      receipt: false,
      own_hand: false,
      reverse: false,
      tags: [{
        tag: String(order.id || ''),
        url: null,
      }],
    },
  };

  const cartRes = await melhorEnvioFetch('/api/v2/me/cart', {
    method: 'POST',
    body: JSON.stringify(cartPayload),
  });
  if (!cartRes.ok) {
    const detail = await parseErrorBody(cartRes);
    throw new Error(detail || `Melhor Envio: falha ao adicionar ao carrinho (${cartRes.status})`);
  }
  const cartItem = await cartRes.json();
  const cartId = cartItem?.id;
  if (!cartId) {
    throw new Error('Melhor Envio: carrinho sem id de etiqueta');
  }

  const checkoutRes = await melhorEnvioFetch('/api/v2/me/shipment/checkout', {
    method: 'POST',
    body: JSON.stringify({ orders: [cartId] }),
  });
  if (!checkoutRes.ok) {
    const detail = await parseErrorBody(checkoutRes);
    throw new Error(
      detail || `Melhor Envio: falha no checkout/pagamento da etiqueta (${checkoutRes.status}). Verifique o saldo na carteira.`
    );
  }
  const checkoutData = await checkoutRes.json();
  const purchase = Array.isArray(checkoutData?.purchase)
    ? checkoutData.purchase[0]
    : (checkoutData?.purchase || checkoutData);
  const protocol = purchase?.protocol
    || checkoutData?.protocol
    || cartItem?.protocol
    || null;
  const meOrderId = purchase?.id || cartId;

  const generateRes = await melhorEnvioFetch('/api/v2/me/shipment/generate', {
    method: 'POST',
    body: JSON.stringify({ orders: [meOrderId] }),
  });
  if (!generateRes.ok) {
    const detail = await parseErrorBody(generateRes);
    throw new Error(detail || `Melhor Envio: falha ao gerar etiqueta (${generateRes.status})`);
  }

  // Geração é assíncrona — breve espera antes da impressão
  await sleep(2000);

  const printRes = await melhorEnvioFetch('/api/v2/me/shipment/print', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'public',
      orders: [meOrderId],
    }),
  });
  if (!printRes.ok) {
    const detail = await parseErrorBody(printRes);
    throw new Error(detail || `Melhor Envio: falha ao imprimir etiqueta (${printRes.status})`);
  }
  const printData = await printRes.json();
  const labelUrl = printData?.url || printData?.link || null;

  let trackingCode = cartItem?.tracking
    || cartItem?.tracking_code
    || purchase?.tracking
    || null;

  // Tenta obter tracking via API
  if (!trackingCode) {
    try {
      const trackRes = await melhorEnvioFetch('/api/v2/me/shipment/tracking', {
        method: 'POST',
        body: JSON.stringify({ orders: [meOrderId] }),
      });
      if (trackRes.ok) {
        const trackData = await trackRes.json();
        const entry = trackData?.[meOrderId] || trackData?.[cartId] || Object.values(trackData || {})[0];
        trackingCode = entry?.tracking || entry?.melhorenvio_tracking || null;
      }
    } catch {
      // tracking opcional neste momento
    }
  }

  return {
    cart_id: cartId,
    order_id: String(meOrderId),
    protocol: protocol ? String(protocol) : null,
    tracking_code: trackingCode ? String(trackingCode).toUpperCase() : null,
    label_url: labelUrl,
  };
}

export async function getMelhorEnvioTracking(order) {
  const meOrderId = order.melhor_envio_order_id || order.melhor_envio_cart_id;
  if (!meOrderId) {
    throw new Error('Pedido sem etiqueta Melhor Envio');
  }

  const response = await melhorEnvioFetch('/api/v2/me/shipment/tracking', {
    method: 'POST',
    body: JSON.stringify({ orders: [meOrderId] }),
  });

  if (!response.ok) {
    const detail = await parseErrorBody(response);
    throw new Error(detail || `Melhor Envio: erro no rastreio (${response.status})`);
  }

  const data = await response.json();
  return data?.[meOrderId] || data;
}
