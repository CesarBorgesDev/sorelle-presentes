import { getSetting } from './settings.js';
import { getCorreiosConfig } from './correios.js';

const TRACKING_URL_BASE = 'https://rastreamento.correios.com.br/app/index.php';

export function normalizeTrackingCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function getCorreiosTrackingUrl(code) {
  const normalized = normalizeTrackingCode(code);
  if (!normalized) return null;
  return `${TRACKING_URL_BASE}?objetos=${encodeURIComponent(normalized)}`;
}

async function getCorreiosApiToken() {
  const user = ((await getSetting('correios_api_user')) || process.env.CORREIOS_API_USER || '').trim();
  const password = ((await getSetting('correios_api_password')) || process.env.CORREIOS_API_PASSWORD || '').trim();

  if (!user || !password) {
    return null;
  }

  const response = await fetch('https://api.correios.com.br/token/v1/autentica', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ numero: user, senha: password }),
  });

  if (!response.ok) {
    throw new Error('Falha ao autenticar na API dos Correios');
  }

  const data = await response.json();
  return data.token || data.access_token || null;
}

function mapTrackingEvents(payload) {
  const objects = payload?.objetos || payload?.objects || [];
  const events = objects[0]?.eventos || objects[0]?.events || [];

  return events.map((event) => ({
    date: event.dtHrCriado || event.data || event.date || null,
    description: event.descricao || event.description || 'Atualização de rastreamento',
    location: [
      event.unidade?.endereco?.cidade || event.cidade,
      event.unidade?.endereco?.uf || event.uf,
    ].filter(Boolean).join(' - ') || null,
  }));
}

export async function trackCorreiosPackage(trackingCode) {
  const code = normalizeTrackingCode(trackingCode);
  if (!code) {
    throw new Error('Informe um código de rastreio válido');
  }

  const trackingUrl = getCorreiosTrackingUrl(code);
  const baseResult = {
    tracking_code: code,
    tracking_url: trackingUrl,
    carrier: 'Correios',
    events: [],
    source: 'link',
  };

  try {
    const token = await getCorreiosApiToken();
    if (!token) {
      return {
        ...baseResult,
        message: 'Configure usuário/senha da API Correios em Configurações → Frete para ver eventos aqui.',
      };
    }

    const response = await fetch(
      `https://api.correios.com.br/srorastro/v1/objetos/${encodeURIComponent(code)}?resultado=T`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      return {
        ...baseResult,
        message: 'Não foi possível consultar os eventos agora. Use o link dos Correios.',
      };
    }

    const payload = await response.json();
    const events = mapTrackingEvents(payload);

    return {
      ...baseResult,
      events,
      source: events.length > 0 ? 'correios_api' : 'link',
      message: events.length > 0 ? null : 'Nenhum evento encontrado ainda. Tente novamente em algumas horas.',
    };
  } catch (err) {
    console.warn('[Correios] Rastreio indisponível:', err.message);
    return {
      ...baseResult,
      message: 'Consulta automática indisponível. Acompanhe pelo site dos Correios.',
    };
  }
}

export async function getSenderLabelConfig() {
  const correios = await getCorreiosConfig();

  return {
    name: ((await getSetting('correios_sender_name')) || process.env.CORREIOS_SENDER_NAME || 'Sorelle Presentes').trim(),
    street: ((await getSetting('correios_sender_street')) || process.env.CORREIOS_SENDER_STREET || '').trim(),
    city: ((await getSetting('correios_sender_city')) || process.env.CORREIOS_SENDER_CITY || '').trim(),
    state: ((await getSetting('correios_sender_state')) || process.env.CORREIOS_SENDER_STATE || '').trim(),
    zip: correios.originZip,
    phone: ((await getSetting('correios_sender_phone')) || process.env.CORREIOS_SENDER_PHONE || '').trim(),
  };
}
