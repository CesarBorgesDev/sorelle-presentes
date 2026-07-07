import { getSetting } from './settings.js';

const API_BASE = (process.env.CORREIOS_API_BASE || 'https://api.correios.com.br').replace(/\/$/, '');

const tokenCache = {
  default: { token: null, expiresAt: 0 },
  postagem: { token: null, expiresAt: 0 },
};

function basicAuthHeader(user, password) {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

async function getApiCredentials() {
  const user = ((await getSetting('correios_api_user')) || process.env.CORREIOS_API_USER || '').trim();
  const password = ((await getSetting('correios_api_password')) || process.env.CORREIOS_API_PASSWORD || '').trim();
  return { user, password };
}

async function fetchToken(path, { user, password, body = null, useBasicAuth = false }) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (useBasicAuth) {
    headers.Authorization = basicAuthHeader(user, password);
  }

  const response = await fetch(`${API_BASE}/token${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || { numero: user, senha: password }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const message = Array.isArray(errBody?.msgs)
      ? errBody.msgs.join('; ')
      : errBody?.message || `Falha ao autenticar na API dos Correios (${response.status})`;
    throw new Error(message);
  }

  const data = await response.json();
  return {
    token: data.token || data.access_token || null,
    expiresAt: data.expiraEm ? new Date(data.expiraEm).getTime() : Date.now() + 23 * 60 * 60 * 1000,
  };
}

export function getCorreiosApiBase() {
  return API_BASE;
}

export async function getCorreiosApiToken({ forPostagem = false } = {}) {
  const cacheKey = forPostagem ? 'postagem' : 'default';
  const cache = tokenCache[cacheKey];

  if (cache.token && cache.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cache.token;
  }

  const { user, password } = await getApiCredentials();
  if (!user || !password) {
    return null;
  }

  let result;
  if (forPostagem) {
    const postCard = ((await getSetting('correios_post_card')) || process.env.CORREIOS_POST_CARD || '').trim();
    const contract = (
      (await getSetting('correios_contract_number'))
      || (await getSetting('correios_company_code'))
      || process.env.CORREIOS_CONTRACT_NUMBER
      || process.env.CORREIOS_COMPANY_CODE
      || ''
    ).trim();
    const drRaw = ((await getSetting('correios_contract_dr')) || process.env.CORREIOS_CONTRACT_DR || '').trim();
    const dr = drRaw ? Number(drRaw) : undefined;

    if (postCard) {
      result = await fetchToken('/v1/autentica/cartaopostagem', {
        user,
        password,
        useBasicAuth: true,
        body: {
          numero: postCard,
          ...(contract ? { contrato: contract } : {}),
          ...(Number.isFinite(dr) ? { dr } : {}),
        },
      });
    } else if (contract) {
      result = await fetchToken('/v1/autentica/contrato', {
        user,
        password,
        useBasicAuth: true,
        body: {
          numero: contract,
          ...(Number.isFinite(dr) ? { dr } : {}),
        },
      });
    } else {
      throw new Error('Configure o cartão de postagem ou contrato em Configurações → Frete para gerar códigos.');
    }
  } else {
    result = await fetchToken('/v1/autentica', { user, password });
  }

  cache.token = result.token;
  cache.expiresAt = result.expiresAt;
  return result.token;
}
