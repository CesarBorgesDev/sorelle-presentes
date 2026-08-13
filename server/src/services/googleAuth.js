import { getGoogleAuthConfig } from './googleAuthConfig.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration';

export function encodeOAuthState(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeOAuthState(state) {
  if (!state) return {};
  try {
    const json = Buffer.from(String(state), 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function notConfiguredError() {
  const err = new Error('Login com Google não configurado. Informe Client ID e Client Secret em Configurações.');
  err.status = 503;
  return err;
}

export async function buildGoogleAuthorizeUrl({ returnUrl = '/' } = {}) {
  const cfg = await getGoogleAuthConfig();
  if (!cfg.isReady) throw notConfiguredError();

  const state = encodeOAuthState({
    returnUrl: returnUrl || '/',
    ts: Date.now(),
  });

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params}`;
}

async function exchangeCodeForTokens(code, cfg) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.callbackUrl,
      grant_type: 'authorization_code',
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const message = data.error_description || data.error || 'Falha ao validar login Google';
    const err = new Error(message);
    err.status = 401;
    throw err;
  }
  return data;
}

async function fetchGoogleUserInfo(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.sub || !data.email) {
    const err = new Error('Não foi possível obter os dados da conta Google');
    err.status = 401;
    throw err;
  }
  return {
    googleId: String(data.sub),
    email: String(data.email).toLowerCase(),
    fullName: data.name || data.given_name || null,
    emailVerified: Boolean(data.email_verified),
  };
}

export async function getGoogleProfileFromCode(code) {
  const cfg = await getGoogleAuthConfig();
  if (!cfg.isReady) throw notConfiguredError();
  const tokens = await exchangeCodeForTokens(code, cfg);
  return fetchGoogleUserInfo(tokens.access_token);
}

/** Testa se o servidor alcança o Google e se Client ID/Secret são aceitos. */
export async function testGoogleAuthConnection() {
  const cfg = await getGoogleAuthConfig();
  const steps = [];

  if (!cfg.clientId || !cfg.clientSecret) {
    return {
      ok: false,
      message: 'Informe Client ID e Client Secret e salve antes de testar.',
      steps,
    };
  }
  if (!cfg.callbackUrl) {
    return {
      ok: false,
      message: 'URL de callback ausente. Defina APP_PUBLIC_URL ou a URI de redirecionamento.',
      steps,
    };
  }

  steps.push({ ok: true, label: 'Credenciais preenchidas' });

  try {
    const discovery = await fetch(GOOGLE_DISCOVERY_URL, {
      signal: AbortSignal.timeout(8000),
    });
    if (!discovery.ok) {
      steps.push({ ok: false, label: `OpenID Discovery: HTTP ${discovery.status}` });
      return { ok: false, message: 'Não foi possível alcançar o Google.', steps };
    }
    steps.push({ ok: true, label: 'Google OpenID alcançado' });
  } catch (err) {
    steps.push({ ok: false, label: err.message || 'Falha de rede' });
    return {
      ok: false,
      message: 'Sem comunicação com o Google. Verifique a internet do servidor.',
      steps,
    };
  }

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: 'sorelle-connection-test',
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.callbackUrl,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json().catch(() => ({}));
    const error = String(data.error || '');
    const description = String(data.error_description || '');

    if (error === 'invalid_client' || error === 'unauthorized_client') {
      steps.push({ ok: false, label: description || 'Client ID ou Client Secret rejeitados' });
      return {
        ok: false,
        message: 'O Google rejeitou as credenciais. Confira Client ID e Client Secret.',
        steps,
      };
    }

    if (error === 'redirect_uri_mismatch' || /redirect_uri/i.test(description)) {
      steps.push({ ok: false, label: `URI cadastrada deve ser: ${cfg.callbackUrl}` });
      return {
        ok: false,
        message: `Cadastre esta URI de redirecionamento no Google Cloud: ${cfg.callbackUrl}`,
        steps,
      };
    }

    steps.push({ ok: true, label: 'Google aceitou as credenciais' });
    return {
      ok: true,
      message: 'Comunicação com o Google OK. Credenciais válidas.',
      steps,
      callback_url: cfg.callbackUrl,
    };
  } catch (err) {
    steps.push({ ok: false, label: err.message || 'Falha de rede' });
    return {
      ok: false,
      message: 'Falha ao falar com o endpoint OAuth do Google.',
      steps,
    };
  }
}

export { isProfileComplete } from '../utils/userProfile.js';
