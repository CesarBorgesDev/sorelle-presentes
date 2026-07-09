import { getSetting } from './settings.js';

// Endpoints oficiais (v3) — https://dev.rodonaves.com.br
const QUOTATION_API_BASE = 'https://quotation-apigateway.rte.com.br';
const DNE_API_BASE = 'https://dne-api.rte.com.br';

const REQUEST_TIMEOUT_MS = 12000;
const DEFAULT_DEADLINE_DAYS = 7;

export const RODONAVES_SERVICE = {
  id: 'rodonaves',
  code: 'RODONAVES',
  defaultLabel: 'Rodonaves',
};

// Cache de token por base URL (cada API Rodonaves tem seu próprio /token)
const tokenCache = new Map();
// Cache de cidade por CEP (o Id da cidade é exigido na cotação)
const cityCache = new Map();

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export async function getRodonavesConfig() {
  const enabledSetting = await getSetting('rodonaves_enabled');
  const enabled = enabledSetting === 'true'
    || (enabledSetting == null && process.env.RODONAVES_ENABLED === 'true');

  const username = ((await getSetting('rodonaves_username')) || process.env.RODONAVES_USERNAME || '').trim();
  const password = ((await getSetting('rodonaves_password')) || process.env.RODONAVES_PASSWORD || '').trim();
  const cnpj = onlyDigits((await getSetting('rodonaves_cnpj')) || process.env.RODONAVES_CNPJ || '');
  const label = ((await getSetting('rodonaves_label')) || RODONAVES_SERVICE.defaultLabel).trim() || RODONAVES_SERVICE.defaultLabel;

  const contactName = ((await getSetting('correios_sender_name')) || 'Sorelle Presentes').trim();
  const contactPhone = onlyDigits((await getSetting('correios_sender_phone')) || '') || '0000000000';

  return {
    enabled,
    username,
    password,
    cnpj,
    label,
    contactName,
    contactPhone,
    isReady: Boolean(username && password && cnpj),
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Rodonaves demorou para responder. Tente novamente.');
    }
    throw new Error('Não foi possível conectar à Rodonaves');
  } finally {
    clearTimeout(timer);
  }
}

async function getRodonavesToken(baseUrl, config) {
  const cached = tokenCache.get(baseUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const body = new URLSearchParams({
    grant_type: 'password',
    username: config.username,
    password: config.password,
    companyId: '1',
    auth_type: 'dev',
  });

  const response = await fetchWithTimeout(`${baseUrl}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    tokenCache.delete(baseUrl);
    if (response.status === 400 || response.status === 401) {
      throw new Error('Credenciais Rodonaves inválidas. Verifique usuário e senha em Configurações → Frete.');
    }
    throw new Error(`Rodonaves: falha na autenticação (${response.status})`);
  }

  const data = await response.json();
  const token = data.access_token;
  if (!token) {
    throw new Error('Rodonaves: resposta de autenticação sem access_token');
  }

  const expiresInSec = Number(data.expires_in) || 1800;
  tokenCache.set(baseUrl, {
    token,
    // renova 60s antes de expirar
    expiresAt: Date.now() + Math.max(60, expiresInSec - 60) * 1000,
  });

  return token;
}

/** Busca o Id da cidade Rodonaves pelo CEP (obrigatório na cotação). */
async function fetchCityByZip(zip, config) {
  const digits = onlyDigits(zip).slice(0, 8);
  if (digits.length !== 8) {
    throw new Error('CEP inválido para cotação Rodonaves');
  }

  const cached = cityCache.get(digits);
  if (cached) return cached;

  const token = await getRodonavesToken(DNE_API_BASE, config);
  const response = await fetchWithTimeout(
    `${DNE_API_BASE}/api/cities/byzipcode?zipCode=${digits}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    throw new Error(`Rodonaves: CEP ${digits} não atendido ou não encontrado`);
  }

  const data = await response.json();
  if (!data?.Id) {
    throw new Error(`Rodonaves: cidade não encontrada para o CEP ${digits}`);
  }

  const city = { id: data.Id, description: data.Description || '' };
  cityCache.set(digits, city);
  return city;
}

function parseFreightValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const raw = String(value).replace(/[^\d.,-]/g, '');
  // "1.234,56" → 1234.56 | "1234.56" → 1234.56
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

async function fetchDeliveryTime({ originCity, destinationCity, config }) {
  try {
    const token = await getRodonavesToken(QUOTATION_API_BASE, config);
    const response = await fetchWithTimeout(`${QUOTATION_API_BASE}/api/v1/prazo-entrega`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        OriginCityDescription: originCity.description,
        OriginUFDescription: originCity.uf || '',
        DestinationCityDescription: destinationCity.description,
        DestinationUFDescription: destinationCity.uf || '',
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const days = Number(data?.DeliveryTime);
    return Number.isFinite(days) && days > 0 ? days : null;
  } catch {
    return null;
  }
}

async function lookupUf(zip) {
  try {
    const digits = onlyDigits(zip).slice(0, 8);
    const response = await fetchWithTimeout(`https://viacep.com.br/ws/${digits}/json/`);
    const data = await response.json();
    if (data?.erro) return null;
    return { city: data.localidade || '', uf: data.uf || '' };
  } catch {
    return null;
  }
}

/**
 * Gera a cotação de frete Rodonaves.
 * Retorna uma opção de frete no mesmo formato das demais (PAC/SEDEX/transportadora).
 */
export async function quoteRodonavesShipping({
  originZip,
  destinationZip,
  packageInfo,
  invoiceValue,
  config = null,
}) {
  const cfg = config || await getRodonavesConfig();

  if (!cfg.enabled) return null;
  if (!cfg.isReady) {
    throw new Error('Rodonaves não configurada. Informe usuário, senha e CNPJ em Configurações → Frete.');
  }

  const origin = onlyDigits(originZip).slice(0, 8);
  const dest = onlyDigits(destinationZip).slice(0, 8);
  if (origin.length !== 8 || dest.length !== 8) {
    throw new Error('CEP de origem ou destino inválido para cotação Rodonaves');
  }

  const [originCity, destinationCity] = await Promise.all([
    fetchCityByZip(origin, cfg),
    fetchCityByZip(dest, cfg),
  ]);

  const weight = Math.max(0.3, Number(packageInfo?.weightKg) || 0.3);
  const declaredValue = Math.max(1, Number(invoiceValue) || 1);

  const payload = {
    OriginZipCode: origin,
    OriginCityId: originCity.id,
    DestinationZipCode: dest,
    DestinationCityId: destinationCity.id,
    TotalWeight: weight,
    EletronicInvoiceValue: declaredValue,
    CustomerTaxIdRegistration: cfg.cnpj,
    ReceiverCpfcnp: cfg.cnpj,
    ContactName: cfg.contactName,
    ContactPhoneNumber: cfg.contactPhone,
    TotalPackages: 1,
    Packs: [{
      AmountPackages: 1,
      Weight: weight,
      Length: Math.max(1, Number(packageInfo?.length) || 20),
      Height: Math.max(1, Number(packageInfo?.height) || 10),
      Width: Math.max(1, Number(packageInfo?.width) || 15),
    }],
  };

  const token = await getRodonavesToken(QUOTATION_API_BASE, cfg);
  const response = await fetchWithTimeout(`${QUOTATION_API_BASE}/api/v1/gera-cotacao`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Rodonaves retornou erro ${response.status}`;
    try {
      const errBody = await response.json();
      const detail = errBody?.Message || errBody?.message || errBody?.error_description;
      if (detail) message = `Rodonaves: ${detail}`;
    } catch {
      // corpo não-JSON — mantém mensagem genérica
    }
    throw new Error(message);
  }

  const data = await response.json();
  const price = parseFreightValue(data?.FreightValue);
  if (price == null || price <= 0) {
    throw new Error('Rodonaves não retornou valor de frete para este destino');
  }

  // Prazo: melhor esforço — UFs via ViaCEP; se falhar, usa prazo padrão
  const [originLoc, destLoc] = await Promise.all([lookupUf(origin), lookupUf(dest)]);
  let deadlineDays = null;
  if (originLoc && destLoc) {
    deadlineDays = await fetchDeliveryTime({
      originCity: { description: originLoc.city.toUpperCase(), uf: originLoc.uf },
      destinationCity: { description: destLoc.city.toUpperCase(), uf: destLoc.uf },
      config: cfg,
    });
  }

  return {
    id: RODONAVES_SERVICE.id,
    service_code: RODONAVES_SERVICE.code,
    label: cfg.label,
    price: Math.round(price * 100) / 100,
    deadline_days: deadlineDays || DEFAULT_DEADLINE_DAYS,
    available: true,
    protocol_id: data?.ProtocolId ?? null,
  };
}
