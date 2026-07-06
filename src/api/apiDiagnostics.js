import { getApiBase } from './apiClient.js';

function now() {
  return new Date().toISOString();
}

function logEntry(level, step, message, details = null) {
  return {
    time: now(),
    level,
    step,
    message,
    details,
  };
}

function formatFetchError(err) {
  if (!err) return 'Erro desconhecido';
  const parts = [err.message || String(err)];
  if (err.name) parts.push(`tipo: ${err.name}`);
  if (err.cause?.message) parts.push(`causa: ${err.cause.message}`);
  return parts.join(' | ');
}

async function fetchStep(path, options = {}) {
  const apiBase = getApiBase();
  const url = `${apiBase}${path}`;
  const started = performance.now();

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    const elapsed = Math.round(performance.now() - started);
    const contentType = response.headers.get('content-type') || '';
    let body = null;
    let rawBody = null;

    if (contentType.includes('application/json')) {
      body = await response.json().catch(() => null);
    } else {
      rawBody = await response.text().catch(() => null);
    }

    return {
      ok: response.ok,
      status: response.status,
      url,
      elapsed,
      contentType,
      body,
      rawBody: rawBody?.slice(0, 500) ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      url,
      elapsed: Math.round(performance.now() - started),
      error: formatFetchError(err),
      cause: err?.cause?.message ?? null,
      name: err?.name ?? null,
    };
  }
}

export function getApiConfig() {
  const runtime = typeof window !== 'undefined' ? window.__SORELLE_API_URL__ : null;
  const build = import.meta.env.VITE_API_URL;
  const resolved = getApiBase();
  const origin = typeof window !== 'undefined' ? window.location.origin : null;

  let crossOrigin = false;
  if (origin && resolved.startsWith('http')) {
    try {
      crossOrigin = new URL(resolved).origin !== origin;
    } catch {
      crossOrigin = false;
    }
  }

  return {
    resolved,
    runtime: runtime?.trim() || null,
    build: build?.trim() || null,
    pageOrigin: origin,
    crossOrigin,
  };
}

export async function runApiDiagnostics() {
  const logs = [];
  const config = getApiConfig();

  logs.push(logEntry('info', 'config', 'URL da API em uso', config));

  if (!config.resolved) {
    logs.push(logEntry('error', 'config', 'Nenhuma URL de API configurada'));
    return { ok: false, config, logs };
  }

  if (config.crossOrigin) {
    logs.push(logEntry(
      'warn',
      'cors',
      'API em outro domínio — o navegador exige CORS e SSL válido',
      { api: config.resolved, loja: config.pageOrigin }
    ));
  }

  // 1) Health
  logs.push(logEntry('info', 'health', `GET ${config.resolved}/health`));
  const health = await fetchStep('/health');

  if (health.status === 0) {
    logs.push(logEntry('error', 'health', 'Falha de rede — não foi possível conectar', health));
    return { ok: false, config, logs, lastError: health };
  }

  if (health.ok && health.body?.status) {
    logs.push(logEntry('success', 'health', `HTTP ${health.status} em ${health.elapsed}ms`, health.body));
  } else {
    logs.push(logEntry('error', 'health', `HTTP ${health.status} — resposta inválida`, health));
    return { ok: false, config, logs, lastError: health };
  }

  // 2) CORS preflight (cross-origin)
  if (config.crossOrigin && config.pageOrigin) {
    logs.push(logEntry('info', 'cors', 'Testando preflight OPTIONS (login)'));
    try {
      const preflightUrl = `${config.resolved}/auth/login`;
      const preflight = await fetch(preflightUrl, {
        method: 'OPTIONS',
        headers: {
          Origin: config.pageOrigin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      });
      logs.push(logEntry(
        preflight.ok || preflight.status === 204 ? 'success' : 'warn',
        'cors',
        `OPTIONS → HTTP ${preflight.status}`,
        {
          url: preflightUrl,
          allowOrigin: preflight.headers.get('access-control-allow-origin'),
          allowMethods: preflight.headers.get('access-control-allow-methods'),
        }
      ));
    } catch (err) {
      logs.push(logEntry('error', 'cors', 'Preflight falhou', { error: formatFetchError(err) }));
    }
  }

  // 3) Login (espera 401 = API responde)
  logs.push(logEntry('info', 'login', 'POST /auth/login (senha inválida — esperado 401)'));
  const login = await fetchStep('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'diagnostico@sorelle.local', password: '__invalid__' }),
  });

  if (login.status === 0) {
    logs.push(logEntry('error', 'login', 'Falha de rede no login', login));
    return { ok: false, config, logs, lastError: login };
  }

  if (login.status === 401) {
    logs.push(logEntry('success', 'login', `HTTP 401 — endpoint de auth respondendo (${login.elapsed}ms)`, login.body));
  } else if (login.ok) {
    logs.push(logEntry('warn', 'login', `HTTP ${login.status} — resposta inesperada`, login));
  } else {
    logs.push(logEntry('error', 'login', `HTTP ${login.status}`, login));
    if (login.rawBody?.includes('id="root"')) {
      logs.push(logEntry(
        'error',
        'login',
        'Resposta é HTML do React — proxy /api não está ativo; Nginx não encaminha para o backend'
      ));
    }
    return { ok: false, config, logs, lastError: login };
  }

  logs.push(logEntry('success', 'done', 'Todos os testes passaram'));
  return { ok: true, config, logs };
}
