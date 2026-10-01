export class ChannelError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ChannelError';
    this.details = details;
  }
}

export async function requestJson(url, {
  method = 'GET',
  headers = {},
  body,
  timeoutMs = 25000,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...headers,
      },
      body: body == null
        ? undefined
        : (typeof body === 'string' || body instanceof FormData ? body : JSON.stringify(body)),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text.slice(0, 500) };
      }
    }
    if (!response.ok) {
      const message = extractErrorMessage(data, text, response.status);
      throw new ChannelError(message, { status: response.status, data });
    }
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new ChannelError('O marketplace não respondeu a tempo.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function extractErrorMessage(data, text, status) {
  if (data && typeof data === 'object') {
    const nested = data.error && typeof data.error === 'object' ? data.error : null;
    const message = data.message
      || data.error_description
      || data.msg
      || data.errorMsg
      || data.error_msg
      || nested?.message
      || (typeof data.error === 'string' ? data.error : null)
      || data.raw;
    if (message) return String(message).slice(0, 500);
  }
  if (text) return text.slice(0, 300);
  return `HTTP ${status}`;
}

export function requireFields(credentials, fields) {
  const missing = fields.filter((field) => !String(credentials?.[field] || '').trim());
  if (missing.length) {
    throw new ChannelError(`Preencha: ${missing.join(', ')}.`);
  }
}

export function formBody(params) {
  return new URLSearchParams(
    Object.entries(params).filter(([, value]) => value != null && value !== '')
  ).toString();
}
