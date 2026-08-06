import { getSetting } from './settings.js';

/**
 * Autenticação Correios API (Token v1)
 * Docs: https://api.correios.com.br/token/v3/api-docs
 *
 * Todas as rotas exigem Authorization: Basic (usuário Meu Correios + código de acesso CWS).
 * - POST /v1/autentica                 → permissões do usuário
 * - POST /v1/autentica/contrato        → body { numero, dr? }
 * - POST /v1/autentica/cartaopostagem  → body { numero, contrato?, dr? }
 *
 * Token reutilizado até próximo de expiraEm (renovação ~5 min antes).
 * Limite: 3 req/s — evitar solicitar token sem necessidade.
 */

const API_BASE = (process.env.CORREIOS_API_BASE || 'https://api.correios.com.br').replace(/\/$/, '');
const TOKEN_BASE = `${API_BASE}/token`;

/** Renovar alguns minutos antes de expirar (docs: tolerância de 30 min para novo token). */
const REFRESH_BEFORE_MS = 5 * 60 * 1000;

const tokenCache = {
  usuario: { token: null, expiresAt: 0, meta: null },
  contrato: { token: null, expiresAt: 0, meta: null },
  cartaopostagem: { token: null, expiresAt: 0, meta: null },
  usuario_pp: { token: null, expiresAt: 0, meta: null },
  contrato_pp: { token: null, expiresAt: 0, meta: null },
  cartaopostagem_pp: { token: null, expiresAt: 0, meta: null },
};

function basicAuthHeader(user, password) {
  return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

function parseErrorMessage(errBody, status) {
  if (Array.isArray(errBody?.msgs) && errBody.msgs.length) {
    return errBody.msgs.join('; ');
  }
  if (errBody?.causa) return String(errBody.causa);
  if (errBody?.message) return String(errBody.message);
  return `Falha ao autenticar na API dos Correios (${status})`;
}

function summarizeTokenPayload(data) {
  const apis = Array.isArray(data?.apis)
    ? data.apis.map((a) => ({
      api: a.api,
      op: a.op,
      paths: a.paths || [],
    }))
    : [];

  return {
    ambiente: data?.ambiente || null,
    id: data?.id || null,
    perfil: data?.perfil || null,
    cnpj: data?.cnpj || null,
    emissao: data?.emissao || null,
    expiraEm: data?.expiraEm || null,
    contrato: data?.contrato
      ? { numero: data.contrato.numero, dr: data.contrato.dr }
      : null,
    cartaoPostagem: data?.cartaoPostagem
      ? {
        numero: data.cartaoPostagem.numero,
        contrato: data.cartaoPostagem.contrato,
        dr: data.cartaoPostagem.dr,
      }
      : null,
    apis,
  };
}

/**
 * Credenciais CWS.
 * @param {{ forPostagem?: boolean }} options
 *   forPostagem=true prefere o código de acesso específico de pré-postagem, se configurado.
 */
export async function getCorreiosApiCredentials({ forPostagem = false } = {}) {
  const user = ((await getSetting('correios_api_user')) || process.env.CORREIOS_API_USER || '').trim();
  const generalPassword = (
    (await getSetting('correios_api_password')) || process.env.CORREIOS_API_PASSWORD || ''
  ).trim();
  const prepostagemPassword = (
    (await getSetting('correios_prepostagem_api_password'))
    || process.env.CORREIOS_PREPOSTAGEM_API_PASSWORD
    || ''
  ).trim();

  const usePrepostagemKey = Boolean(forPostagem && prepostagemPassword);
  return {
    user,
    password: usePrepostagemKey ? prepostagemPassword : generalPassword,
    generalPassword,
    prepostagemPassword,
    usedPrepostagemKey: usePrepostagemKey,
    hasPrepostagemKey: Boolean(prepostagemPassword),
  };
}

export async function getCorreiosContractContext() {
  const postCard = ((await getSetting('correios_post_card')) || process.env.CORREIOS_POST_CARD || '').trim();
  // Contrato comercial REST — não usar código de empresa legado (CalcPrecoPrazo)
  const contract = (
    (await getSetting('correios_contract_number'))
    || process.env.CORREIOS_CONTRACT_NUMBER
    || ''
  ).trim();
  const drRaw = ((await getSetting('correios_contract_dr')) || process.env.CORREIOS_CONTRACT_DR || '').trim();
  const dr = drRaw ? Number(drRaw) : undefined;

  return {
    postCard,
    contract,
    dr: Number.isFinite(dr) ? dr : undefined,
  };
}

/**
 * Resolve o modo de autenticação.
 * @param {'auto'|'usuario'|'contrato'|'cartaopostagem'} preferred
 * @param {{ forPostagem?: boolean }} options
 */
export async function resolveCorreiosAuthMode(preferred = 'auto', { forPostagem = false } = {}) {
  if (preferred && preferred !== 'auto') return preferred;

  const { postCard, contract } = await getCorreiosContractContext();
  if (postCard) return 'cartaopostagem';
  if (contract) return 'contrato';
  if (forPostagem) {
    throw new Error('Configure o cartão de postagem ou contrato em Configurações → Frete para gerar códigos.');
  }
  return 'usuario';
}

/**
 * Solicita token conforme documentação oficial (sempre Basic Auth).
 * @returns {Promise<{ token: string, expiresAt: number, meta: object, mode: string, endpoint: string }>}
 */
export async function requestCorreiosToken(mode = 'auto', { forPostagem = false, forceRefresh = false } = {}) {
  const resolvedMode = await resolveCorreiosAuthMode(mode, { forPostagem });
  const credentials = await getCorreiosApiCredentials({ forPostagem });
  const cacheKey = credentials.usedPrepostagemKey ? `${resolvedMode}_pp` : resolvedMode;
  const cache = tokenCache[cacheKey] || (tokenCache[cacheKey] = { token: null, expiresAt: 0, meta: null });

  if (!forceRefresh && cache.token && cache.expiresAt > Date.now() + REFRESH_BEFORE_MS) {
    return {
      token: cache.token,
      expiresAt: cache.expiresAt,
      meta: cache.meta,
      mode: resolvedMode,
      endpoint: endpointForMode(resolvedMode),
      cached: true,
      used_prepostagem_key: credentials.usedPrepostagemKey,
    };
  }

  const { user, password } = credentials;
  if (!user || !password) {
    throw new Error(
      forPostagem
        ? 'Configure usuário e o código de acesso CWS de pré-postagem (ou o código geral) em Frete → API Correios.'
        : 'Configure usuário e senha (código de acesso CWS) da API Correios em Configurações → Frete.'
    );
  }

  const { postCard, contract, dr } = await getCorreiosContractContext();
  let path;
  let body = null;

  if (resolvedMode === 'cartaopostagem') {
    if (!postCard) {
      throw new Error('Informe o número do cartão de postagem para autenticar por cartão.');
    }
    path = '/v1/autentica/cartaopostagem';
    body = {
      numero: postCard,
      ...(contract ? { contrato: contract } : {}),
      ...(dr != null ? { dr } : {}),
    };
  } else if (resolvedMode === 'contrato') {
    if (!contract) {
      throw new Error('Informe o número do contrato comercial para autenticar por contrato.');
    }
    path = '/v1/autentica/contrato';
    body = {
      numero: contract,
      ...(dr != null ? { dr } : {}),
    };
  } else {
    path = '/v1/autentica';
  }

  const headers = {
    Accept: 'application/json',
    Authorization: basicAuthHeader(user, password),
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${TOKEN_BASE}${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(parseErrorMessage(data, response.status));
  }

  const token = data.token || data.access_token || null;
  if (!token) {
    throw new Error('Resposta da API Token sem campo "token".');
  }

  const expiresAt = data.expiraEm
    ? new Date(data.expiraEm).getTime()
    : Date.now() + 23 * 60 * 60 * 1000;
  const meta = summarizeTokenPayload(data);

  cache.token = token;
  cache.expiresAt = expiresAt;
  cache.meta = meta;

  return {
    token,
    expiresAt,
    meta,
    mode: resolvedMode,
    endpoint: path,
    cached: false,
    used_prepostagem_key: credentials.usedPrepostagemKey,
  };
}

function endpointForMode(mode) {
  if (mode === 'cartaopostagem') return '/v1/autentica/cartaopostagem';
  if (mode === 'contrato') return '/v1/autentica/contrato';
  return '/v1/autentica';
}

export function getCorreiosApiBase() {
  return API_BASE;
}

export function clearCorreiosTokenCache() {
  for (const key of Object.keys(tokenCache)) {
    tokenCache[key] = { token: null, expiresAt: 0, meta: null };
  }
}

/**
 * Obtém Bearer token (com cache). Compatível com chamadas existentes.
 * @param {{ forPostagem?: boolean, mode?: string }} options
 */
export async function getCorreiosApiToken({ forPostagem = false, mode = 'auto' } = {}) {
  try {
    const result = await requestCorreiosToken(mode, { forPostagem });
    return result.token;
  } catch (err) {
    if (!forPostagem && /Configure usuário e senha/i.test(err.message)) {
      return null;
    }
    throw err;
  }
}

/**
 * Testa a API Token (e opcionalmente Preço) com as credenciais salvas.
 * @param {{ mode?: string, destinationZip?: string, serviceCode?: string }} options
 */
export async function testCorreiosApiConnection({
  mode = 'auto',
  destinationZip = '',
  serviceCode = '03298',
} = {}) {
  const { user, password } = await getCorreiosApiCredentials();
  const contractCtx = await getCorreiosContractContext();
  const steps = [];

  if (!user || !password) {
    return {
      ok: false,
      message: 'Usuário e senha (código de acesso CWS) não configurados.',
      steps,
      credentials: {
        has_user: Boolean(user),
        has_password: Boolean(password),
        has_post_card: Boolean(contractCtx.postCard),
        has_contract: Boolean(contractCtx.contract),
        contract: contractCtx.contract || null,
        dr: contractCtx.dr ?? null,
      },
    };
  }

  let auth;
  try {
    clearCorreiosTokenCache();
    auth = await requestCorreiosToken(mode, { forceRefresh: true });
    steps.push({
      name: 'token',
      ok: true,
      endpoint: `POST ${TOKEN_BASE}${auth.endpoint}`,
      mode: auth.mode,
      ambiente: auth.meta?.ambiente || null,
      expiraEm: auth.meta?.expiraEm || null,
      perfil: auth.meta?.perfil || null,
      contrato: auth.meta?.contrato || null,
      cartaoPostagem: auth.meta?.cartaoPostagem || null,
      apis_autorizadas: auth.meta?.apis?.length || 0,
    });
  } catch (err) {
    steps.push({
      name: 'token',
      ok: false,
      endpoint: `POST ${TOKEN_BASE}${endpointForMode(mode === 'auto' ? 'usuario' : mode)}`,
      error: err.message,
    });
    return {
      ok: false,
      message: err.message,
      steps,
      credentials: {
        has_user: true,
        has_password: true,
        has_post_card: Boolean(contractCtx.postCard),
        has_contract: Boolean(contractCtx.contract),
        contract: contractCtx.contract || null,
        dr: contractCtx.dr ?? null,
      },
    };
  }

  const dest = String(destinationZip || '').replace(/\D/g, '').slice(0, 8);
  if (dest.length === 8) {
    const originZip = (
      (await getSetting('correios_origin_zip')) || process.env.CORREIOS_ORIGIN_ZIP || '01310100'
    ).replace(/\D/g, '').slice(0, 8);

    const code = String(serviceCode || '03298').replace(/\D/g, '') || '03298';
    const params = new URLSearchParams({
      cepOrigem: originZip,
      cepDestino: dest,
      psObjeto: '300',
      tpObjeto: '2',
      comprimento: '20',
      largura: '15',
      altura: '10',
    });
    if (contractCtx.contract && contractCtx.dr != null) {
      params.set('nuContrato', contractCtx.contract);
      params.set('nuDR', String(contractCtx.dr));
    }

    const priceUrl = `${API_BASE}/preco/v1/nacional/${encodeURIComponent(code)}?${params.toString()}`;
    try {
      const priceRes = await fetch(priceUrl, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
      });
      const priceBody = await priceRes.json().catch(() => ({}));
      if (!priceRes.ok) {
        const msg = parseErrorMessage(priceBody, priceRes.status);
        steps.push({
          name: 'preco',
          ok: false,
          endpoint: `GET ${API_BASE}/preco/v1/nacional/${code}`,
          status: priceRes.status,
          error: msg,
        });
      } else {
        steps.push({
          name: 'preco',
          ok: true,
          endpoint: `GET ${API_BASE}/preco/v1/nacional/${code}`,
          coProduto: priceBody.coProduto || code,
          pcFinal: priceBody.pcFinal || null,
          psCobrado: priceBody.psCobrado || null,
        });
      }
    } catch (err) {
      steps.push({
        name: 'preco',
        ok: false,
        endpoint: `GET ${API_BASE}/preco/v1/nacional/${code}`,
        error: err.message,
      });
    }

    const prazoUrl = `${API_BASE}/prazo/v1/nacional/${encodeURIComponent(code)}?${new URLSearchParams({
      cepOrigem: originZip,
      cepDestino: dest,
    }).toString()}`;
    try {
      const prazoRes = await fetch(prazoUrl, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
      });
      const prazoBody = await prazoRes.json().catch(() => ({}));
      if (!prazoRes.ok) {
        steps.push({
          name: 'prazo',
          ok: false,
          endpoint: `GET ${API_BASE}/prazo/v1/nacional/${code}`,
          status: prazoRes.status,
          error: parseErrorMessage(prazoBody, prazoRes.status),
        });
      } else {
        steps.push({
          name: 'prazo',
          ok: true,
          endpoint: `GET ${API_BASE}/prazo/v1/nacional/${code}`,
          coProduto: prazoBody.coProduto || code,
          prazoEntrega: prazoBody.prazoEntrega ?? null,
        });
      }
    } catch (err) {
      steps.push({
        name: 'prazo',
        ok: false,
        endpoint: `GET ${API_BASE}/prazo/v1/nacional/${code}`,
        error: err.message,
      });
    }
  }

  const failed = steps.filter((s) => !s.ok);
  const tokenOk = steps.find((s) => s.name === 'token')?.ok;

  return {
    ok: Boolean(tokenOk) && failed.length === 0,
    message: tokenOk
      ? (failed.length
        ? `Token OK, mas ${failed.map((f) => f.name).join(' e ')} falhou(aram).`
        : 'Conexão com a API dos Correios OK.')
      : 'Falha na autenticação.',
    steps,
    credentials: {
      has_user: true,
      has_password: true,
      has_post_card: Boolean(contractCtx.postCard),
      has_contract: Boolean(contractCtx.contract),
      contract: contractCtx.contract || null,
      dr: contractCtx.dr ?? null,
    },
  };
}
