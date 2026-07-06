import cors from 'cors';
import { config } from './env.js';

function normalizeOrigin(value) {
  return value?.replace(/\/$/, '') ?? '';
}

function addOriginVariants(set, value) {
  const normalized = normalizeOrigin(value);
  if (!normalized) return;

  set.add(normalized);

  if (normalized.includes('://www.')) {
    set.add(normalized.replace('://www.', '://'));
  } else if (normalized.includes('://')) {
    set.add(normalized.replace('://', '://www.'));
  }
}

function buildAllowedOrigins() {
  const origins = new Set([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);

  for (const key of ['CORS_ORIGIN', 'FRONTEND_URL', 'APP_PUBLIC_URL']) {
    const raw = process.env[key];
    if (!raw) continue;

    for (const part of raw.split(',')) {
      addOriginVariants(origins, part.trim());
    }
  }

  if (config.domain) {
    origins.add(`https://${config.domain}`);
    origins.add(`https://www.${config.domain}`);
    origins.add(`http://${config.domain}`);
    origins.add(`http://www.${config.domain}`);
    origins.add(`https://api.${config.domain}`);
  }

  return origins;
}

const allowedOrigins = buildAllowedOrigins();

export function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;

  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;

    const domain = config.domain;
    if (hostname === domain || hostname === `www.${domain}` || hostname === `api.${domain}`) {
      return true;
    }
    if (hostname.endsWith(`.${domain}`)) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export const corsMiddleware = cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, origin || true);
      return;
    }
    console.warn('[CORS] Origem bloqueada:', origin);
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
