import { getSetting } from './settings.js';
import { getRodonavesConfig, quoteRodonavesShipping } from './rodonaves.js';

const DEFAULT_ORIGIN_ZIP = '01310100';
const DEFAULT_WEIGHT_KG = 0.3;
const DEFAULT_LENGTH = 20;
const DEFAULT_WIDTH = 15;
const DEFAULT_HEIGHT = 10;

export const CORREIOS_SERVICES = {
  pac: { code: '04510', label: 'PAC', contractCode: '03298' },
  sedex: { code: '04014', label: 'SEDEX', contractCode: '03220' },
};

export const CARRIER_SERVICE = {
  id: 'transportadora',
  code: 'TRANSPORTADORA',
  defaultLabel: 'Transportadora',
};

async function getCarrierSettings() {
  const enabledSetting = await getSetting('shipping_carrier_enabled');
  const enabled = enabledSetting === 'true'
    || (enabledSetting == null && process.env.SHIPPING_CARRIER_ENABLED === 'true');

  const label = ((await getSetting('shipping_carrier_name')) || process.env.SHIPPING_CARRIER_NAME || CARRIER_SERVICE.defaultLabel).trim();
  const price = Number((await getSetting('shipping_carrier_price')) || process.env.SHIPPING_CARRIER_PRICE || 0);
  const deadlineDays = Number((await getSetting('shipping_carrier_deadline_days')) || process.env.SHIPPING_CARRIER_DEADLINE_DAYS || 10);

  return {
    enabled,
    id: CARRIER_SERVICE.id,
    code: CARRIER_SERVICE.code,
    label: label || CARRIER_SERVICE.defaultLabel,
    price: Number.isFinite(price) ? Math.max(0, price) : 0,
    deadlineDays: Math.max(1, deadlineDays || 10),
  };
}

function buildCarrierOption(carrier, packageInfo, roundMoneyFn) {
  if (!carrier?.enabled) return null;

  const weight = Math.max(0.3, Number(packageInfo?.weightKg) || DEFAULT_WEIGHT_KG);
  const price = carrier.price > 0
    ? carrier.price
    : roundMoneyFn(22 + weight * 4.5);

  return {
    id: carrier.id,
    service_code: carrier.code,
    label: carrier.label,
    price,
    deadline_days: carrier.deadlineDays,
    available: true,
  };
}

function appendCarrierOption(options, carrier, packageInfo, roundMoneyFn) {
  const carrierOption = buildCarrierOption(carrier, packageInfo, roundMoneyFn);
  return carrierOption ? [...options, carrierOption] : options;
}

function correiosServicesOnly(services) {
  return services.filter((s) => s.id !== CARRIER_SERVICE.id);
}

function getFallbackMode() {
  return (process.env.CORREIOS_FALLBACK || '').trim().toLowerCase();
}

export function shouldUseEstimateOnly() {
  return getFallbackMode() === 'estimate';
}

export function shouldAutoFallback() {
  const mode = getFallbackMode();
  if (mode === 'auto') return true;
  if (mode === 'off' || mode === 'estimate') return false;
  return process.env.NODE_ENV !== 'production';
}

export async function getCorreiosConfig() {
  const originZip = onlyDigits(
    (await getSetting('correios_origin_zip')) || process.env.CORREIOS_ORIGIN_ZIP || DEFAULT_ORIGIN_ZIP
  ).slice(0, 8);

  const companyCode = ((await getSetting('correios_company_code')) || process.env.CORREIOS_COMPANY_CODE || '').trim();
  const password = ((await getSetting('correios_password')) || process.env.CORREIOS_PASSWORD || '').trim();
  const hasContract = Boolean(companyCode && password);
  const fallbackMode = getFallbackMode() || (process.env.NODE_ENV !== 'production' ? 'auto' : 'off');
  const carrier = await getCarrierSettings();

  const correiosServices = hasContract
    ? [
        { id: 'pac', code: CORREIOS_SERVICES.pac.contractCode, label: CORREIOS_SERVICES.pac.label },
        { id: 'sedex', code: CORREIOS_SERVICES.sedex.contractCode, label: CORREIOS_SERVICES.sedex.label },
      ]
    : [
        { id: 'pac', code: CORREIOS_SERVICES.pac.code, label: CORREIOS_SERVICES.pac.label },
        { id: 'sedex', code: CORREIOS_SERVICES.sedex.code, label: CORREIOS_SERVICES.sedex.label },
      ];

  return {
    originZip: originZip || DEFAULT_ORIGIN_ZIP,
    companyCode,
    password,
    hasContract,
    fallbackMode,
    carrier,
    defaultWeightKg: Number(process.env.CORREIOS_DEFAULT_WEIGHT_KG || DEFAULT_WEIGHT_KG),
    defaultLength: Number(process.env.CORREIOS_DEFAULT_LENGTH_CM || DEFAULT_LENGTH),
    defaultWidth: Number(process.env.CORREIOS_DEFAULT_WIDTH_CM || DEFAULT_WIDTH),
    defaultHeight: Number(process.env.CORREIOS_DEFAULT_HEIGHT_CM || DEFAULT_HEIGHT),
    services: carrier.enabled
      ? [...correiosServices, { id: carrier.id, code: carrier.code, label: carrier.label }]
      : correiosServices,
  };
}

export { getCarrierSettings };

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseBrazilianMoney(value) {
  if (value == null || value === '') return null;
  const normalized = String(value).replace('.', '').replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function extractXmlBlocks(xml, tag) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const blocks = [];
  let match = regex.exec(xml);
  while (match) {
    blocks.push(match[1]);
    match = regex.exec(xml);
  }
  return blocks;
}

function readXmlTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`, 'i'));
  return match?.[1]?.trim() ?? '';
}

function parseCorreiosResponse(xml) {
  return extractXmlBlocks(xml, 'cServico').map((block) => {
    const code = readXmlTag(block, 'Codigo');
    const errorCode = readXmlTag(block, 'Erro');
    const errorMessage = readXmlTag(block, 'MsgErro');
    const price = parseBrazilianMoney(readXmlTag(block, 'Valor'));
    const deadline = Number(readXmlTag(block, 'PrazoEntrega') || 0);

    return {
      service_code: code,
      price,
      deadline_days: deadline,
      error_code: errorCode,
      error_message: errorMessage,
      available: errorCode === '0' && price != null && price >= 0,
    };
  });
}

export function buildPackageFromProducts(products, config) {
  let totalWeight = 0;
  let maxLength = config.defaultLength;
  let maxWidth = config.defaultWidth;
  let totalHeight = config.defaultHeight;

  for (const item of products) {
    const qty = Number(item.quantity || 1);
    const weight = Number(item.weight_kg || config.defaultWeightKg);
    totalWeight += weight * qty;

    maxLength = Math.max(maxLength, Number(item.length_cm || config.defaultLength));
    maxWidth = Math.max(maxWidth, Number(item.width_cm || config.defaultWidth));
    totalHeight += Number(item.height_cm || config.defaultHeight) * qty * 0.5;
  }

  totalWeight = Math.max(0.3, Math.round(totalWeight * 100) / 100);
  totalHeight = Math.min(105, Math.max(config.defaultHeight, Math.round(totalHeight)));

  return {
    weightKg: totalWeight,
    length: Math.min(105, maxLength),
    width: Math.min(105, maxWidth),
    height: totalHeight,
  };
}

function zipDistanceScore(originZip, destinationZip) {
  const origin = Number(originZip.slice(0, 5));
  const destination = Number(destinationZip.slice(0, 5));
  if (!Number.isFinite(origin) || !Number.isFinite(destination)) return 5;
  return Math.min(10, Math.abs(origin - destination) / 5000);
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function buildEstimatedShippingQuote({ cfg, destinationZip, packageInfo, fallbackReason }) {
  const dest = onlyDigits(destinationZip).slice(0, 8);
  const distance = zipDistanceScore(cfg.originZip, dest);
  const weight = Math.max(0.3, Number(packageInfo.weightKg) || DEFAULT_WEIGHT_KG);

  const pacBase = 14.9 + weight * 6.5 + distance * 8.5;
  const sedexBase = pacBase * 1.75;
  const pacDeadline = Math.min(15, Math.max(4, Math.round(5 + distance)));
  const sedexDeadline = Math.min(8, Math.max(2, Math.round(2 + distance * 0.6)));

  const prices = {
    pac: roundMoney(pacBase),
    sedex: roundMoney(sedexBase),
  };
  const deadlines = {
    pac: pacDeadline,
    sedex: sedexDeadline,
  };

  const options = appendCarrierOption(
    cfg.services
      .filter((s) => s.id !== CARRIER_SERVICE.id)
      .map((service) => ({
        id: service.id,
        service_code: service.code,
        label: service.label,
        price: prices[service.id] ?? roundMoney(pacBase),
        deadline_days: deadlines[service.id] ?? pacDeadline,
        available: true,
      })),
    cfg.carrier,
    packageInfo,
    roundMoney
  );

  return {
    origin_zip: cfg.originZip,
    destination_zip: dest,
    package: packageInfo,
    options,
    estimated: true,
    fallback_reason: fallbackReason,
  };
}

async function fetchCorreiosApiQuote({ destinationZip, packageInfo, config }) {
  const cfg = config;
  const dest = onlyDigits(destinationZip).slice(0, 8);

  if (dest.length !== 8) {
    throw new Error('CEP de destino inválido');
  }

  if (!cfg.originZip || cfg.originZip.length !== 8) {
    throw new Error('CEP de origem não configurado. Defina em Configurações → Frete.');
  }

  const serviceCodes = correiosServicesOnly(cfg.services).map((s) => s.code).join(',');
  const params = new URLSearchParams({
    nCdEmpresa: cfg.companyCode,
    sDsSenha: cfg.password,
    nCdServico: serviceCodes,
    sCepOrigem: cfg.originZip,
    sCepDestino: dest,
    nVlPeso: String(packageInfo.weightKg),
    nCdFormato: '1',
    nVlComprimento: String(Math.max(16, packageInfo.length)),
    nVlAltura: String(Math.max(2, packageInfo.height)),
    nVlLargura: String(Math.max(11, packageInfo.width)),
    nVlDiametro: '0',
    sCdMaoPropria: 'n',
    nVlValorDeclarado: '0',
    sCdAvisoRecebimento: 'n',
    StrRetorno: 'xml',
  });

  const url = `https://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx?${params.toString()}`;
  const controller = new AbortController();
  const timeoutMs = shouldAutoFallback() ? 8000 : 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/xml, text/xml' },
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Correios demorou para responder. Tente novamente.');
    }
    throw new Error('Não foi possível conectar aos Correios');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Correios retornou erro ${response.status}`);
  }

  const xml = await response.text();
  const parsed = parseCorreiosResponse(xml);

  const options = correiosServicesOnly(cfg.services).map((service) => {
    const result = parsed.find((row) => row.service_code === service.code);
    if (!result?.available) {
      return {
        id: service.id,
        service_code: service.code,
        label: service.label,
        price: null,
        deadline_days: null,
        available: false,
        error: result?.error_message || 'Serviço indisponível para este CEP',
      };
    }

    return {
      id: service.id,
      service_code: service.code,
      label: service.label,
      price: result.price,
      deadline_days: result.deadline_days,
      available: true,
    };
  });

  const finalOptions = appendCarrierOption(options, cfg.carrier, packageInfo, roundMoney);
  const availableOptions = finalOptions.filter((o) => o.available);
  if (availableOptions.length === 0) {
    const firstError = options.find((o) => o.error)?.error || 'Não foi possível calcular o frete';
    throw new Error(firstError);
  }

  return {
    origin_zip: cfg.originZip,
    destination_zip: dest,
    package: packageInfo,
    options: finalOptions,
    estimated: false,
  };
}

async function tryAppendRodonavesOption(quote, { packageInfo, invoiceValue }) {
  try {
    const rodonavesConfig = await getRodonavesConfig();
    if (!rodonavesConfig.enabled) return quote;

    const option = await quoteRodonavesShipping({
      originZip: quote.origin_zip,
      destinationZip: quote.destination_zip,
      packageInfo,
      invoiceValue,
      config: rodonavesConfig,
    });

    if (option) {
      quote.options = [...quote.options, option];
    }
  } catch (err) {
    console.warn('[Rodonaves] Cotação indisponível:', err.message);
  }
  return quote;
}

export async function quoteCorreiosShipping({ destinationZip, packageInfo, config = null, invoiceValue = 0 }) {
  const cfg = config || await getCorreiosConfig();

  let quote;
  if (shouldUseEstimateOnly()) {
    quote = buildEstimatedShippingQuote({
      cfg,
      destinationZip,
      packageInfo,
      fallbackReason: 'Modo estimado ativo (CORREIOS_FALLBACK=estimate)',
    });
  } else {
    try {
      quote = await fetchCorreiosApiQuote({ destinationZip, packageInfo, config: cfg });
    } catch (err) {
      if (!shouldAutoFallback()) throw err;
      console.warn('[Correios] API indisponível, usando frete estimado:', err.message);
      quote = buildEstimatedShippingQuote({
        cfg,
        destinationZip,
        packageInfo,
        fallbackReason: err.message,
      });
    }
  }

  return tryAppendRodonavesOption(quote, { packageInfo, invoiceValue });
}

export async function resolveShippingQuote({ destinationZip, serviceId, packageInfo, invoiceValue = 0 }) {
  const quote = await quoteCorreiosShipping({ destinationZip, packageInfo, invoiceValue });
  const selected = quote.options.find((o) => o.id === serviceId && o.available);

  if (!selected) {
    throw new Error('Opção de frete inválida ou indisponível');
  }

  return {
    ...selected,
    origin_zip: quote.origin_zip,
    destination_zip: quote.destination_zip,
    package: quote.package,
  };
}

export async function fetchAddressByCep(cep) {
  const digits = onlyDigits(cep).slice(0, 8);
  if (digits.length !== 8) {
    throw new Error('CEP inválido');
  }

  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  const data = await response.json();

  if (data.erro) {
    throw new Error('CEP não encontrado');
  }

  return {
    zip_code: digits,
    street: data.logradouro || '',
    district: data.bairro || '',
    city: data.localidade || '',
    state: data.uf || '',
    formatted: [data.logradouro, data.bairro, data.localidade, data.uf].filter(Boolean).join(', '),
  };
}
