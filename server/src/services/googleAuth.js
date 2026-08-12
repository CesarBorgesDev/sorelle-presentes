import { config, isGoogleAuthConfigured } from '../config/env.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

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

export function buildGoogleAuthorizeUrl({ returnUrl = '/' } = {}) {
  if (!isGoogleAuthConfigured()) {
    const err = new Error('Login com Google não configurado. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.');
    err.status = 503;
    throw err;
  }

  const state = encodeOAuthState({
    returnUrl: returnUrl || '/',
    ts: Date.now(),
  });

  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleCallbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params}`;
}

async function exchangeCodeForTokens(code) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: config.googleCallbackUrl,
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
  if (!isGoogleAuthConfigured()) {
    const err = new Error('Login com Google não configurado');
    err.status = 503;
    throw err;
  }
  const tokens = await exchangeCodeForTokens(code);
  return fetchGoogleUserInfo(tokens.access_token);
}

export { isProfileComplete } from '../utils/userProfile.js';
