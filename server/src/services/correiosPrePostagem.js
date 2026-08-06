import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';
import { parseOrderRecipientAddress } from '../utils/address.js';
import {
  buildPackageFromProducts,
  CARRIER_SERVICE,
  CORREIOS_SERVICES,
  fetchAddressByCep,
  getCorreiosConfig,
} from './correios.js';
import {
  clearCorreiosTokenCache,
  getCorreiosApiBase,
  getCorreiosApiCredentials,
  getCorreiosApiToken,
  getCorreiosContractContext,
  requestCorreiosToken,
} from './correiosAuth.js';
import { getSetting } from './settings.js';
import { STORE_PICKUP_ID } from './storePickup.js';
import { normalizeTrackingCode } from './correiosTracking.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LABELS_DIR = path.join(__dirname, '../../uploads/labels');

const SERVICE_CODE_TO_CONTRACT = {
  [CORREIOS_SERVICES.pac.code]: CORREIOS_SERVICES.pac.contractCode,
  [CORREIOS_SERVICES.sedex.code]: CORREIOS_SERVICES.sedex.contractCode,
  pac: CORREIOS_SERVICES.pac.contractCode,
  sedex: CORREIOS_SERVICES.sedex.contractCode,
};

const STEP_LABELS = {
  autenticacao: 'Autenticação CWS',
  criar_prepostagem: 'Criar pré-postagem',
  emitir_rotulo: 'Emitir rótulo',
  baixar_rotulo: 'Baixar rótulo',
  codigo_objeto: 'Obter código de rastreio',
  preflight: 'Pré-requisitos',
  desconhecido: 'Processamento',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stepLabel(step) {
  return STEP_LABELS[step] || STEP_LABELS.desconhecido;
}

/** Remove ruído de exceções Java dos Correios (ApiNegocioRuntimeException: ...). */
function cleanCorreiosMessage(text) {
  let value = String(text || '').trim();
  if (!value || value === 'null' || value === 'undefined') return '';
  value = value
    .replace(/^ApiNegocioRuntimeException:\s*/i, '')
    .replace(/\bApiNegocioRuntimeException:\s*/gi, '')
    .replace(/^br\.com\.correios[\w.$]*Exception:\s*/i, '')
    .trim();
  return value;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function truncate(value, max) {
  return String(value || '').trim().slice(0, max);
}

function formatMoney(value) {
  const num = Number(value || 0);
  return (Number.isFinite(num) ? Math.max(0, num) : 0).toFixed(2);
}

function splitPhone(phone) {
  const digits = onlyDigits(phone);
  if (digits.length >= 10) {
    return {
      ddd: digits.slice(0, 2),
      number: digits.slice(2),
    };
  }
  return { ddd: '', number: digits };
}

/** Telefone fixo Correios: DDD 2 dígitos + número 8 dígitos. Celular: DDD + 9 dígitos. */
function buildCorreiosPhoneFields(phone) {
  const ddd = onlyDigits(phone?.ddd).slice(0, 2);
  const number = onlyDigits(phone?.number);
  if (ddd.length !== 2 || number.length < 8) return {};

  // Celular (9 dígitos)
  if (number.length >= 9) {
    return {
      dddCelular: ddd,
      celular: number.slice(-9),
    };
  }

  return {
    dddTelefone: ddd,
    telefone: number.slice(-8),
  };
}

function normalizeStreetNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'S/N';
  const cleaned = raw.replace(/^n[ºo°.]?\s*/i, '').trim();
  return truncate(cleaned || 'S/N', 6);
}

function isValidEmail(email) {
  const value = String(email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function dimensionCm(value, min) {
  const n = Math.max(min, Math.round(Number(value) || min));
  return String(Math.min(999, n));
}

function parseRecipientAddress(order) {
  const parsed = parseOrderRecipientAddress(order);
  return {
    street: parsed.street,
    number: parsed.number || 'S/N',
    complement: parsed.complement || '',
    district: parsed.district || 'Centro',
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
  };
}

async function getSenderConfig() {
  const correios = await getCorreiosConfig();
  const phone = splitPhone(
    (await getSetting('correios_sender_phone')) || process.env.CORREIOS_SENDER_PHONE || ''
  );

  const zip = onlyDigits(correios.originZip).slice(0, 8);
  let street = truncate((await getSetting('correios_sender_street')) || process.env.CORREIOS_SENDER_STREET || '', 50);
  let number = truncate((await getSetting('correios_sender_number')) || process.env.CORREIOS_SENDER_NUMBER || 'S/N', 6);
  let complement = truncate((await getSetting('correios_sender_complement')) || process.env.CORREIOS_SENDER_COMPLEMENT || '', 30);
  let district = truncate((await getSetting('correios_sender_district')) || process.env.CORREIOS_SENDER_DISTRICT || '', 30);
  let city = truncate((await getSetting('correios_sender_city')) || process.env.CORREIOS_SENDER_CITY || '', 30);
  let state = truncate((await getSetting('correios_sender_state')) || process.env.CORREIOS_SENDER_STATE || '', 2).toUpperCase();

  // Completa campos vazios pelo CEP de origem (ViaCEP) — evita falha quando só o CEP foi configurado
  if (zip.length === 8 && (!street || !city || !district || !state)) {
    try {
      const fromCep = await fetchAddressByCep(zip);
      if (!street && fromCep.street) street = truncate(fromCep.street, 50);
      if (!district && fromCep.district) district = truncate(fromCep.district, 30);
      if (!city && fromCep.city) city = truncate(fromCep.city, 30);
      if (!state && fromCep.state) state = truncate(fromCep.state, 2).toUpperCase();
    } catch (err) {
      console.warn('[Correios] ViaCEP do remetente indisponível:', err.message);
    }
  }

  if (!district) district = 'Centro';
  if (!state) state = 'SP';
  if (!number) number = 'S/N';

  return {
    name: truncate((await getSetting('correios_sender_name')) || process.env.CORREIOS_SENDER_NAME || 'Sorelle Presentes', 50),
    street,
    number,
    complement,
    district,
    city,
    state,
    zip,
    email: truncate((await getSetting('correios_sender_email')) || process.env.CORREIOS_SENDER_EMAIL || 'contato@sorellepresentes.com.br', 255),
    cnpj: onlyDigits((await getSetting('correios_sender_cnpj')) || process.env.CORREIOS_SENDER_CNPJ || ''),
    phone,
  };
}

async function buildPackageFromOrder(order, config) {
  const items = Array.isArray(order.items) ? order.items : [];
  const productIds = items.map((item) => item.product_id).filter(Boolean);

  let productsById = new Map();
  if (productIds.length > 0) {
    const result = await pool.query(
      'SELECT id, weight_kg, length_cm, width_cm, height_cm FROM products WHERE id = ANY($1)',
      [productIds]
    );
    productsById = new Map(result.rows.map((row) => [row.id, row]));
  }

  const cartLike = items.map((item) => {
    const product = productsById.get(item.product_id) || {};
    return {
      quantity: item.quantity || 1,
      weight_kg: product.weight_kg,
      length_cm: product.length_cm,
      width_cm: product.width_cm,
      height_cm: product.height_cm,
    };
  });

  return buildPackageFromProducts(cartLike, config);
}

function declarationContent(name) {
  const text = truncate(name || 'Produto', 60);
  // Correios exige descrição clara com no mínimo 5 caracteres
  return text.length >= 5 ? text : `${text} item`.slice(0, 60);
}

function buildDeclarationItems(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length === 0) {
    return [{
      conteudo: 'Produtos Sorelle Presentes',
      quantidade: '1',
      valor: formatMoney(order.total),
    }];
  }

  return items.map((item) => ({
    conteudo: declarationContent(item.product_name || 'Produto'),
    quantidade: String(Math.max(1, Number(item.quantity || 1))),
    valor: formatMoney(Number(item.unit_price || item.total || 0)),
  }));
}

function resolvePrePostagemServiceCode(order, config) {
  const raw = String(order.shipping_service_code || '').trim();
  if (!raw || raw === CARRIER_SERVICE.code) return raw;

  // Com contrato/cartão, a pré-postagem exige códigos de contrato (03298/03220)
  if (config?.hasRestContract || config?.postCard || config?.contractNumber) {
    return SERVICE_CODE_TO_CONTRACT[raw] || SERVICE_CODE_TO_CONTRACT[raw.toLowerCase()] || raw;
  }
  return raw;
}

function extractTrackingCodeFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const candidates = [
    payload.codigoObjeto,
    payload.codigo_objeto,
    payload.numeroEtiqueta,
    payload.etiqueta,
    payload.eticket,
    payload?.objeto?.codigoObjeto,
    payload?.prePostagem?.codigoObjeto,
    Array.isArray(payload.itens) ? payload.itens[0]?.codigoObjeto : null,
    Array.isArray(payload.listaObjetos) ? payload.listaObjetos[0]?.codigoObjeto : null,
    Array.isArray(payload.content) ? payload.content[0]?.codigoObjeto : null,
  ];

  if (Array.isArray(payload.itens)) {
    for (const item of payload.itens) {
      candidates.push(item?.codigoObjeto);
    }
  }

  for (const value of candidates) {
    const code = normalizeTrackingCode(value);
    if (code && /[A-Z]{2}\d{9}[A-Z]{2}/i.test(code)) return code.toUpperCase();
    if (code && code.length >= 13) return code;
  }
  return '';
}

async function correiosApiFetch(path, { method = 'GET', token, body } = {}) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${getCorreiosApiBase()}/prepostagem${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text().catch(() => '');
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { ok: response.ok, status: response.status, data };
}

async function fetchPrePostagemById(token, id) {
  if (!id) return null;
  const { ok, data } = await correiosApiFetch(
    `/v2/prepostagens?${new URLSearchParams({ id: String(id) }).toString()}`,
    { token }
  );
  if (!ok) return null;

  if (Array.isArray(data?.itens)) return data.itens[0] || null;
  if (Array.isArray(data?.content)) return data.content[0] || null;
  if (Array.isArray(data)) return data[0] || null;
  if (data?.id || data?.codigoObjeto) return data;
  return null;
}

function extractIdRecibo(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const candidates = [
    payload.idRecibo,
    payload.id_recibo,
    payload.recibo,
    payload.id,
    Array.isArray(payload.itens) ? payload.itens[0]?.idRecibo : null,
  ];
  for (const value of candidates) {
    const id = String(value || '').trim();
    if (id && id.length >= 8) return id;
  }
  return '';
}

function extractBase64Pdf(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') {
    const text = payload.trim();
    if (text.length > 80 && !text.startsWith('{')) return text.replace(/\s/g, '');
    return '';
  }
  if (typeof payload !== 'object') return '';

  const candidates = [
    payload.dados,
    payload.data,
    payload.arquivo,
    payload.pdf,
    payload.conteudo,
    payload.file,
    Array.isArray(payload.itens) ? payload.itens[0]?.dados : null,
  ];
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const cleaned = value.replace(/^data:application\/pdf;base64,/i, '').replace(/\s/g, '');
    if (cleaned.length > 80) return cleaned;
  }
  return '';
}

/** Manual: POST /v1/prepostagens/rotulo/assincrono/pdf → idRecibo */
async function requestRotuloAssincronoPdf(token, prepostagemId) {
  const response = await correiosApiFetch('/v1/prepostagens/rotulo/assincrono/pdf', {
    method: 'POST',
    token,
    body: {
      idsPrePostagem: [prepostagemId],
      tipoRotulo: 'P',
      formatoRotulo: 'ET',
    },
  });
  // Resposta pode ser JSON { idRecibo } ou string pura do recibo
  let idRecibo = extractIdRecibo(response.data);
  if (!idRecibo && typeof response.data === 'string') {
    idRecibo = String(response.data).trim();
  }
  return {
    ok: response.ok,
    status: response.status,
    idRecibo,
    data: response.data,
  };
}

/** Manual: GET /v1/prepostagens/rotulo/download/assincrono/{idRecibo} */
async function downloadRotuloAssincrono(token, idRecibo, { attempts = 8 } = {}) {
  let last = { ok: false, status: null, data: null, base64: '' };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(1000 + attempt * 250);
    const response = await correiosApiFetch(
      `/v1/prepostagens/rotulo/download/assincrono/${encodeURIComponent(idRecibo)}`,
      { token }
    );
    const base64 = extractBase64Pdf(response.data);
    last = {
      ok: Boolean(response.ok && base64),
      status: response.status,
      data: response.data,
      base64,
    };
    if (last.ok) return last;
  }
  return last;
}

function saveCorreiosRotuloPdf(orderId, base64) {
  if (!fs.existsSync(LABELS_DIR)) {
    fs.mkdirSync(LABELS_DIR, { recursive: true });
  }
  const cleaned = String(base64 || '')
    .replace(/^data:application\/pdf;base64,/i, '')
    .replace(/\s/g, '');
  if (!cleaned) return null;
  const filename = `etiqueta-${orderId}.pdf`;
  fs.writeFileSync(path.join(LABELS_DIR, filename), Buffer.from(cleaned, 'base64'));
  return `/api/uploads/labels/${filename}`;
}

async function cancelPrePostagem(token, { id, codigoObjeto } = {}) {
  if (id) {
    const response = await correiosApiFetch(`/v1/prepostagens/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      token,
    });
    return {
      ok: response.ok || response.status === 204 || response.status === 200,
      status: response.status,
      data: response.data,
      by: 'id',
    };
  }
  if (codigoObjeto) {
    const response = await correiosApiFetch(
      `/v1/prepostagens/objeto/${encodeURIComponent(codigoObjeto)}`,
      { method: 'DELETE', token }
    );
    return {
      ok: response.ok || response.status === 204 || response.status === 200,
      status: response.status,
      data: response.data,
      by: 'codigoObjeto',
    };
  }
  return { ok: false, status: null, data: null, by: null };
}

/**
 * Fluxo do manual: emitir rótulo assíncrono → baixar PDF → consultar codigoObjeto.
 */
async function emitRotuloAndResolveCode(token, prepostagemId) {
  const emitted = await requestRotuloAssincronoPdf(token, prepostagemId);
  if (!emitted.ok) {
    return {
      code: '',
      idRecibo: emitted.idRecibo || '',
      label_url: null,
      label_base64: '',
      raw: { emitir: emitted },
      emit_ok: false,
      download_ok: false,
    };
  }

  let downloaded = { ok: false, status: null, data: null, base64: '' };
  if (emitted.idRecibo) {
    downloaded = await downloadRotuloAssincrono(token, emitted.idRecibo);
  }

  let code = extractTrackingCodeFromPayload(emitted.data)
    || extractTrackingCodeFromPayload(downloaded.data)
    || '';
  let refreshed = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0) await sleep(800 * attempt);
    refreshed = await fetchPrePostagemById(token, prepostagemId);
    code = extractTrackingCodeFromPayload(refreshed) || code;
    if (code) break;
  }

  return {
    code,
    idRecibo: emitted.idRecibo || '',
    label_base64: downloaded.base64 || '',
    label_url: null,
    raw: {
      emitir: emitted.data,
      download: downloaded.data,
      prepostagem: refreshed,
    },
    emit_ok: true,
    download_ok: downloaded.ok,
    status_atual: refreshed?.statusAtual || refreshed?.descStatusAtual || null,
  };
}

async function getPrePostagemConfig() {
  const correios = await getCorreiosConfig();
  const { postCard, contract, dr } = await getCorreiosContractContext();
  return {
    ...correios,
    postCard,
    contractNumber: contract,
    contractDr: dr,
  };
}

/**
 * Checklist de pré-requisitos para gerar código Correios no pedido.
 * @returns {Promise<{ ready: boolean, items: Array, service_code_mapped: string|null, service_code_raw: string }>}
 */
export async function buildCorreiosCodePrerequisites(order) {
  const [credentials, contractCtx, correios, sender] = await Promise.all([
    getCorreiosApiCredentials({ forPostagem: true }),
    getCorreiosContractContext(),
    getCorreiosConfig(),
    getSenderConfig(),
  ]);
  const { user, password, hasPrepostagemKey } = credentials;
  const recipient = parseRecipientAddress(order);
  const serviceRaw = String(order.shipping_service_code || '').trim();
  const serviceId = String(order.shipping_service_id || order.shipping_service_code || '').trim();
  const isPickup = serviceRaw === 'pickup' || serviceId === STORE_PICKUP_ID || /retirada/i.test(String(order.shipping_service_name || ''));
  const isCarrier = serviceRaw === CARRIER_SERVICE.code || serviceId === CARRIER_SERVICE.id;
  const isCorreiosService = Boolean(serviceRaw)
    && !isPickup
    && !isCarrier
    && (
      Boolean(SERVICE_CODE_TO_CONTRACT[serviceRaw])
      || Boolean(SERVICE_CODE_TO_CONTRACT[serviceRaw.toLowerCase()])
      || ['03298', '03220', '04510', '04014'].includes(serviceRaw)
    );

  const config = { ...correios, postCard: contractCtx.postCard, contractNumber: contractCtx.contract };
  const mapped = isCorreiosService ? resolvePrePostagemServiceCode(order, config) : null;

  const hasCardOrContract = Boolean(contractCtx.postCard || contractCtx.contract);
  const contractNeedsDr = Boolean(contractCtx.contract && !contractCtx.postCard && contractCtx.dr == null);

  const items = [
    {
      id: 'api_credentials',
      ok: Boolean(user && password),
      label: 'Usuário e código de acesso CWS',
      help: 'Preencha o usuário Meu Correios e o código CWS em Frete → API Correios.',
      hrefHint: 'api_correios',
    },
    {
      id: 'prepostagem_key',
      ok: Boolean(hasPrepostagemKey || (user && password)),
      label: hasPrepostagemKey
        ? 'Código de acesso específico de pré-postagem'
        : 'Código de acesso de pré-postagem (recomendado)',
      help: hasPrepostagemKey
        ? 'Usando a chave CWS dedicada à API Pré-postagem (86720).'
        : 'Gere no CWS um código só com Pré-postagem (86720) e salve no campo específico — evita misturar com Preço/Prazo.',
      hrefHint: 'api_correios',
    },
    {
      id: 'card_or_contract',
      ok: hasCardOrContract && !contractNeedsDr,
      label: contractNeedsDr
        ? 'Contrato informado — falta a DR'
        : 'Cartão de postagem ou contrato (+ DR)',
      help: contractNeedsDr
        ? 'Informe a DR/Superintendência do contrato (número curto no PDF do contrato).'
        : 'Cartão de postagem e/ou número do contrato comercial em Frete → API Correios.',
      hrefHint: 'api_correios',
    },
    {
      id: 'sender',
      ok: Boolean(
        sender.name?.length >= 3
        && sender.street
        && sender.city
        && sender.state
        && onlyDigits(sender.zip).length === 8
      ),
      label: 'Remetente completo (logradouro, cidade, UF, CEP)',
      help: 'Aba Frete → Remetente. O endereço da Retirada na loja não é usado na pré-postagem.',
      hrefHint: 'remetente',
    },
    {
      id: 'service',
      ok: isCorreiosService,
      label: 'Pedido com frete PAC ou SEDEX',
      help: isPickup
        ? 'Este pedido é retirada na loja — não gera código Correios.'
        : isCarrier
          ? 'Este pedido usa transportadora — não gera código Correios.'
          : 'O pedido precisa ter sido cotado com PAC ou SEDEX dos Correios.',
      hrefHint: null,
    },
    {
      id: 'recipient_address',
      ok: Boolean(order.customer_name && recipient.street && recipient.city && recipient.state),
      label: 'Endereço do destinatário no pedido',
      help: 'Nome, rua, cidade e UF devem estar no endereço do pedido.',
      hrefHint: null,
    },
    {
      id: 'recipient_zip',
      ok: onlyDigits(recipient.zip).length === 8,
      label: 'CEP do destinatário',
      help: 'O CEP costuma estar nas observações do pedido (CEP: 00000000). Sem CEP a API recusa.',
      hrefHint: null,
    },
  ];

  return {
    ready: items.every((item) => item.ok),
    items,
    service_code_raw: serviceRaw || null,
    service_code_mapped: mapped,
    origin_zip: onlyDigits(sender.zip).slice(0, 8) || null,
    destination_zip: onlyDigits(recipient.zip).slice(0, 8) || null,
  };
}

function validatePrePostagemSetup({ sender, recipient, order, config }) {
  // Validação síncrona leve; o preflight cobre a mensagem completa
  const postCard = (config.postCard || '').trim();
  const contract = (config.contractNumber || '').trim();
  if (!postCard && !contract) {
    throwCorreiosError({
      message: 'Falta cartão de postagem ou contrato comercial.',
      details: ['Configure em Configurações → Frete → API Correios.'],
      step: 'preflight',
      nextSteps: [
        'Informe o cartão de postagem (recomendado) ou contrato + DR.',
        'Salve e use Testar API no modo Cartão de postagem.',
      ],
    });
  }

  if (!sender.street || !sender.city || onlyDigits(sender.zip).length !== 8) {
    throwCorreiosError({
      message: 'Remetente incompleto para pré-postagem.',
      details: ['Preencha logradouro, cidade e CEP na aba Remetente.'],
      step: 'preflight',
      nextSteps: [
        'Abra Configurações → Frete → Remetente.',
        'Use “Preencher pelo CEP de origem”, confira o número e salve.',
      ],
    });
  }

  if (!recipient.street || !recipient.city || onlyDigits(recipient.zip).length !== 8) {
    throwCorreiosError({
      message: 'Destinatário incompleto no pedido.',
      details: ['É preciso endereço parseável e CEP (notes do pedido).'],
      step: 'preflight',
      nextSteps: [
        'Confira o endereço do cliente no pedido.',
        'Garanta que as observações contenham “CEP: 00000000”.',
      ],
    });
  }

  const serviceCode = String(order.shipping_service_code || '').trim();
  if (!serviceCode || serviceCode === CARRIER_SERVICE.code) {
    throwCorreiosError({
      message: 'Este pedido não tem serviço Correios (PAC/SEDEX).',
      details: ['Transportadora e retirada na loja não geram código Correios.'],
      step: 'preflight',
      nextSteps: ['Use um pedido enviado por PAC ou SEDEX.'],
    });
  }
}

function buildPrePostagemPayload(order, {
  sender,
  recipient,
  packageInfo,
  serviceCode,
}) {
  const senderPhone = buildCorreiosPhoneFields(sender.phone);
  const recipientPhone = buildCorreiosPhoneFields(splitPhone(order.customer_phone));
  const recipientEmail = truncate(order.customer_email, 255);
  const senderEmail = truncate(sender.email, 255);
  const weightGrams = String(Math.min(999999, Math.max(1, Math.round(Number(packageInfo.weightKg) * 1000))));

  return {
    remetente: {
      nome: truncate(sender.name, 50),
      ...(isValidEmail(senderEmail) ? { email: senderEmail } : {}),
      ...(sender.cnpj && (sender.cnpj.length === 11 || sender.cnpj.length === 14)
        ? { cpfCnpj: sender.cnpj }
        : {}),
      ...senderPhone,
      endereco: {
        cep: onlyDigits(sender.zip).slice(0, 8),
        logradouro: truncate(sender.street, 50),
        numero: normalizeStreetNumber(sender.number),
        ...(sender.complement ? { complemento: truncate(sender.complement, 30) } : {}),
        bairro: truncate(sender.district || 'Centro', 30),
        cidade: truncate(sender.city, 30),
        uf: truncate(sender.state, 2).toUpperCase(),
      },
    },
    destinatario: {
      nome: truncate(order.customer_name, 50),
      ...(isValidEmail(recipientEmail) ? { email: recipientEmail } : {}),
      ...recipientPhone,
      endereco: {
        cep: onlyDigits(recipient.zip).slice(0, 8),
        logradouro: truncate(recipient.street, 50),
        numero: normalizeStreetNumber(recipient.number),
        ...(recipient.complement ? { complemento: truncate(recipient.complement, 30) } : {}),
        bairro: truncate(recipient.district || 'Centro', 30),
        cidade: truncate(recipient.city, 30),
        uf: truncate(recipient.state, 2).toUpperCase(),
        // Schema exige regiao; em postagem nacional usamos a cidade
        regiao: truncate(recipient.city || recipient.state || 'BR', 50),
      },
    },
    codigoServico: String(serviceCode || '').trim(),
    pesoInformado: weightGrams,
    codigoFormatoObjetoInformado: '2',
    alturaInformada: dimensionCm(packageInfo.height, 2),
    larguraInformada: dimensionCm(packageInfo.width, 11),
    comprimentoInformado: dimensionCm(packageInfo.length, 16),
    // Schema exige string "0" | "1" (não número)
    cienteObjetoNaoProibido: '1',
    logisticaReversa: 'N',
    itensDeclaracaoConteudo: buildDeclarationItems(order),
    pedidoExternoOrigem: truncate(order.id, 25),
    observacao: truncate(`Pedido ${order.id}`, 50),
  };
}

function collectCorreiosMessages(value, bag = [], depth = 0) {
  if (value == null || depth > 5) return bag;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = cleanCorreiosMessage(value);
    if (text && !bag.includes(text)) {
      bag.push(text);
    }
    return bag;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectCorreiosMessages(item, bag, depth + 1);
    return bag;
  }

  if (typeof value === 'object') {
    // Prefer msgs over causa (causa costuma ser só ApiNegocioRuntimeException)
    for (const key of [
      'msgs', 'message', 'msg', 'erro', 'error', 'detail', 'details',
      'mensagem', 'descricao', 'description', 'title', 'causa',
    ]) {
      if (value[key] != null) collectCorreiosMessages(value[key], bag, depth + 1);
    }
    if (!value.msgs && !value.message && !value.causa) {
      for (const [key, nested] of Object.entries(value)) {
        if (['date', 'method', 'path', 'stackTrace', 'status', 'raw'].includes(key)) continue;
        if (typeof nested === 'string' || Array.isArray(nested)) {
          collectCorreiosMessages(nested, bag, depth + 1);
        }
      }
    }
  }

  return bag;
}

function extractCorreiosError(body, status, fallback = 'Erro na API de pré-postagem') {
  const messages = collectCorreiosMessages(body)
    .filter((m) => !/^ApiNegocioRuntimeException:?$/i.test(m));
  if (messages.length > 0) return messages.join(' | ');
  // Fallback: serializa body curto para não perder o motivo do 400
  if (body != null && typeof body === 'object' && Object.keys(body).length > 0) {
    try {
      const snap = JSON.stringify(body);
      if (snap && snap !== '{}' && snap.length < 800) {
        return `${fallback}${status ? ` (HTTP ${status})` : ''}: ${snap}`;
      }
    } catch {
      // ignore
    }
  }
  if (typeof body === 'string' && body.trim()) {
    return cleanCorreiosMessage(body) || `${fallback}${status ? ` (HTTP ${status})` : ''}`;
  }
  if (status) return `${fallback} (HTTP ${status})`;
  return fallback;
}

function nextStepsForStep(step, apiMsg = '') {
  const text = String(apiMsg || '');
  if (step === 'autenticacao') {
    return [
      'Confira usuário Meu Correios e código de acesso no CWS.',
      'Salve em Frete → API Correios e use Testar API (modo Cartão).',
    ];
  }
  if (step === 'criar_prepostagem') {
    const steps = [
      'No CWS, libere a API Pré-postagem (serviço 86720) no cartão.',
      'Confirme PAC/SEDEX de contrato (03298/03220) no cartão.',
      'Confira remetente (aba Remetente) e CEP do destinatário no pedido.',
    ];
    if (/CON-011|86720|não foi encontrado|nao foi encontrado/i.test(text)) {
      steps.unshift('O cartão não tem o serviço de pré-postagem (86720). Peça liberação ao comercial dos Correios.');
    }
    if (/PRC-111|nuDR|DR/i.test(text)) {
      steps.unshift('Preencha a DR do contrato em Frete → API Correios e salve.');
    }
    return steps;
  }
  if (step === 'emitir_rotulo' || step === 'baixar_rotulo' || step === 'codigo_objeto') {
    return [
      'Verifique saldo de etiquetas do cartão no CWS.',
      'Confirme se o serviço PAC/SEDEX está liberado no contrato.',
      'Use Testar pré-postagem em Frete → API Correios e tente de novo.',
    ];
  }
  if (step === 'preflight') {
    return [
      'Complete o checklist em Configurações → Frete (API Correios + Remetente).',
      'Abra o pedido novamente e confira os itens pendentes.',
    ];
  }
  return ['Revise Frete → API Correios, Remetente e os dados do pedido.'];
}

function throwCorreiosError({
  message,
  details = [],
  step = null,
  status = null,
  raw = null,
  nextSteps = null,
}) {
  const uniqueDetails = [...new Set(
    details
      .flatMap((item) => {
        if (typeof item === 'string') return [cleanCorreiosMessage(item)].filter(Boolean);
        return collectCorreiosMessages(item);
      })
      .map((item) => cleanCorreiosMessage(item))
      .filter((item) => item && !/^ApiNegocioRuntimeException:?$/i.test(item))
  )];

  let finalMessage = cleanCorreiosMessage(message) || uniqueDetails[0] || 'Erro ao gerar código Correios';
  const apiDetail = uniqueDetails.find((d) => (
    d !== finalMessage
    && !d.startsWith('Serviço enviado')
    && !d.startsWith('HTTP ')
    && !d.startsWith('CEP ')
    && !d.startsWith('Confira ')
  ));
  if (apiDetail && /recusaram|não foi possível|Erro na API|Falta |incompleto/i.test(finalMessage)) {
    if (!finalMessage.includes(apiDetail)) {
      finalMessage = `${finalMessage.replace(/\.$/, '')}: ${apiDetail}`;
    }
  }

  const err = new Error(finalMessage);
  err.code = 'CORREIOS_PREPOSTAGEM';
  err.details = uniqueDetails;
  err.step = step;
  err.step_label = stepLabel(step);
  err.next_steps = Array.isArray(nextSteps) && nextSteps.length
    ? nextSteps
    : nextStepsForStep(step, finalMessage);
  err.status = status;
  err.raw = raw;
  throw err;
}

export async function generateCorreiosTrackingCode(order) {
  let token = null;
  let prepostagemId = null;

  try {
    const preflight = await buildCorreiosCodePrerequisites(order);
    if (!preflight.ready) {
      const pending = preflight.items.filter((item) => !item.ok);
      throwCorreiosError({
        message: 'Ainda faltam configurações para gerar o código Correios.',
        details: pending.map((item) => `${item.label}: ${item.help}`),
        step: 'preflight',
        nextSteps: pending.map((item) => item.help),
      });
    }

    const config = await getPrePostagemConfig();
    const sender = await getSenderConfig();
    const recipient = parseRecipientAddress(order);
    validatePrePostagemSetup({ sender, recipient, order, config });

    token = await getCorreiosApiToken({ forPostagem: true });
    if (!token) {
      throwCorreiosError({
        message: 'Credenciais da API Correios não configuradas.',
        details: [
          'Preencha usuário Meu Correios e o código de acesso de pré-postagem em Frete → API Correios.',
          'Salve e use “Testar pré-postagem” antes de gerar o código.',
        ],
        step: 'autenticacao',
      });
    }

    const packageInfo = await buildPackageFromOrder(order, config);
    const serviceCode = resolvePrePostagemServiceCode(order, config);
    const payload = buildPrePostagemPayload(order, {
      sender,
      recipient,
      packageInfo,
      serviceCode,
    });

    const created = await correiosApiFetch('/v1/prepostagens', {
      method: 'POST',
      token,
      body: payload,
    });

    if (!created.ok) {
      const apiMsg = extractCorreiosError(created.data, created.status);
      console.error('[Correios] Pré-postagem recusada', {
        status: created.status,
        serviceCode,
        apiMsg,
        body: created.data,
      });
      throwCorreiosError({
        message: 'Os Correios recusaram a criação da pré-postagem.',
        details: [
          apiMsg,
          `HTTP ${created.status}`,
          `Serviço enviado: ${serviceCode}`,
          `CEP remetente: ${payload.remetente?.endereco?.cep || '-'}`,
          `CEP destinatário: ${payload.destinatario?.endereco?.cep || '-'}`,
        ],
        step: 'criar_prepostagem',
        status: created.status,
        raw: created.data,
        nextSteps: nextStepsForStep('criar_prepostagem', apiMsg),
      });
    }

    const body = created.data || {};
    prepostagemId = body.id || body.idPrePostagem || body.idPrepostagem || null;
    if (!prepostagemId) {
      throwCorreiosError({
        message: 'A API criou a pré-postagem sem retornar o id.',
        details: collectCorreiosMessages(body),
        step: 'criar_prepostagem',
        raw: body,
      });
    }

    // Manual: codigoObjeto é atribuído na emissão do rótulo (assíncrono PDF)
    const rotulo = await emitRotuloAndResolveCode(token, prepostagemId);
    if (!rotulo.emit_ok) {
      await cancelPrePostagem(token, { id: prepostagemId });
      const apiMsg = extractCorreiosError(rotulo.raw?.emitir?.data || rotulo.raw?.emitir, rotulo.raw?.emitir?.status);
      throwCorreiosError({
        message: 'Não foi possível emitir o rótulo da pré-postagem.',
        details: [
          apiMsg,
          `ID da pré-postagem: ${prepostagemId}`,
          'A pré-postagem de teste foi cancelada automaticamente.',
        ].filter(Boolean),
        step: 'emitir_rotulo',
        status: rotulo.raw?.emitir?.status || null,
        raw: rotulo.raw,
        nextSteps: nextStepsForStep('emitir_rotulo', apiMsg),
      });
    }

    let trackingCode = rotulo.code || extractTrackingCodeFromPayload(body);
    if (!trackingCode) {
      await cancelPrePostagem(token, { id: prepostagemId });
      throwCorreiosError({
        message: 'O rótulo foi solicitado, mas o código de rastreio não foi gerado.',
        details: [
          `ID da pré-postagem: ${prepostagemId}`,
          rotulo.idRecibo ? `Recibo do rótulo: ${rotulo.idRecibo}` : null,
          rotulo.status_atual ? `Status na API: ${rotulo.status_atual}` : null,
          `Serviço: ${serviceCode}`,
          ...collectCorreiosMessages(rotulo.raw),
        ].filter(Boolean),
        step: 'codigo_objeto',
        raw: { create: body, rotulo: rotulo.raw },
      });
    }

    let labelUrl = null;
    let labelSource = null;
    if (rotulo.download_ok && rotulo.label_base64) {
      labelUrl = saveCorreiosRotuloPdf(order.id, rotulo.label_base64);
      if (labelUrl) labelSource = 'correios_pdf';
    }

    return {
      tracking_code: trackingCode,
      prepostagem_id: prepostagemId,
      service_code: body.codigoServico || payload.codigoServico,
      status: rotulo.status_atual || body.descStatusAtual || body.statusAtual || null,
      label_url: labelUrl,
      label_source: labelSource,
      id_recibo: rotulo.idRecibo || null,
      raw: { create: body, rotulo: rotulo.raw },
    };
  } catch (err) {
    if (err?.code === 'CORREIOS_PREPOSTAGEM') throw err;

    const details = collectCorreiosMessages(err?.raw || err?.body || err?.details);
    if (err?.message && !details.includes(err.message)) {
      details.unshift(err.message);
    }

    throwCorreiosError({
      message: err?.message && err.message !== 'null'
        ? err.message
        : 'Não foi possível gerar o código Correios.',
      details: details.length
        ? details
        : ['Erro inesperado ao falar com a API dos Correios. Tente novamente.'],
      step: err?.step || 'desconhecido',
      status: err?.status || null,
      raw: err?.raw || null,
    });
  }
}

/**
 * Teste admin (manual): token → criar → rótulo assíncrono → download → cancelar.
 */
export async function testCorreiosPrePostagem({
  destinationZip = '',
  serviceCode = '03298',
} = {}) {
  const steps = [];
  const [apiCreds, contractCtx, sender] = await Promise.all([
    getCorreiosApiCredentials({ forPostagem: true }),
    getCorreiosContractContext(),
    getSenderConfig(),
  ]);
  const { user, password, hasPrepostagemKey, usedPrepostagemKey } = apiCreds;

  const credentials = {
    has_user: Boolean(user),
    has_password: Boolean(password),
    has_prepostagem_key: hasPrepostagemKey,
    used_prepostagem_key: usedPrepostagemKey,
    has_post_card: Boolean(contractCtx.postCard),
    has_contract: Boolean(contractCtx.contract),
    contract: contractCtx.contract || null,
    dr: contractCtx.dr ?? null,
    has_sender_street: Boolean(sender.street),
    has_sender_city: Boolean(sender.city),
    sender_zip: onlyDigits(sender.zip).slice(0, 8) || null,
  };

  if (!user || !password) {
    return {
      ok: false,
      message: 'Usuário e código de acesso CWS não configurados.',
      steps,
      next_steps: [
        'Preencha usuário Meu Correios e o código de acesso de pré-postagem na aba API Correios.',
        'Salve e tente novamente.',
      ],
      credentials,
    };
  }

  if (!contractCtx.postCard && !contractCtx.contract) {
    return {
      ok: false,
      message: 'Informe cartão de postagem ou contrato comercial.',
      steps,
      next_steps: [
        'Preencha o cartão de postagem (recomendado) ou contrato + DR.',
        'Salve e use o modo Cartão ao testar.',
      ],
      credentials,
    };
  }

  if (!sender.street || !sender.city || onlyDigits(sender.zip).length !== 8) {
    return {
      ok: false,
      message: 'Remetente incompleto (logradouro, cidade e CEP de origem).',
      steps: [{
        name: 'remetente',
        ok: false,
        error: 'Preencha a aba Remetente e o CEP na aba Correios.',
      }],
      next_steps: [
        'Abra Frete → Remetente, use “Preencher pelo CEP de origem” e salve.',
        'Confira o CEP de origem na aba Correios.',
      ],
      credentials,
    };
  }

  steps.push({
    name: 'remetente',
    ok: true,
    city: sender.city,
    uf: sender.state,
    cep: onlyDigits(sender.zip).slice(0, 8),
  });

  let auth;
  try {
    clearCorreiosTokenCache();
    auth = await requestCorreiosToken('auto', { forPostagem: true, forceRefresh: true });
    const apis = Array.isArray(auth.meta?.apis) ? auth.meta.apis : [];
    const hasPrepostagemApi = apis.some((item) => {
      const apiName = String(item?.api || '').toLowerCase();
      const paths = Array.isArray(item?.paths) ? item.paths.join(' ') : '';
      return /prepostagem|pré-postagem|pre-postagem/i.test(`${apiName} ${paths}`);
    });
    steps.push({
      name: 'token',
      ok: true,
      mode: auth.mode,
      ambiente: auth.meta?.ambiente || null,
      apis_autorizadas: apis.length,
      prepostagem_no_token: hasPrepostagemApi,
      used_prepostagem_key: Boolean(auth.used_prepostagem_key),
    });
    if (!hasPrepostagemApi && apis.length > 0) {
      steps.push({
        name: 'apis_token',
        ok: false,
        error: 'O token não listou a API de pré-postagem. Confira a liberação do serviço 86720 no CWS.',
      });
    }
  } catch (err) {
    steps.push({
      name: 'token',
      ok: false,
      error: cleanCorreiosMessage(err.message) || err.message,
    });
    return {
      ok: false,
      message: cleanCorreiosMessage(err.message) || 'Falha na autenticação CWS.',
      steps,
      next_steps: nextStepsForStep('autenticacao', err.message),
      credentials,
    };
  }

  const destZip = onlyDigits(destinationZip || sender.zip).slice(0, 8);
  let destStreet = sender.street;
  let destDistrict = sender.district || 'Centro';
  let destCity = sender.city;
  let destState = sender.state;
  let destNumber = '100';

  if (destZip.length === 8 && destZip !== onlyDigits(sender.zip).slice(0, 8)) {
    try {
      const fromCep = await fetchAddressByCep(destZip);
      if (fromCep.street) destStreet = fromCep.street;
      if (fromCep.district) destDistrict = fromCep.district;
      if (fromCep.city) destCity = fromCep.city;
      if (fromCep.state) destState = fromCep.state;
      steps.push({
        name: 'cep_destino',
        ok: true,
        cep: destZip,
        city: destCity,
        uf: destState,
      });
    } catch (err) {
      steps.push({
        name: 'cep_destino',
        ok: false,
        cep: destZip,
        error: err.message || 'ViaCEP indisponível; usando endereço do remetente.',
      });
    }
  } else {
    steps.push({
      name: 'cep_destino',
      ok: true,
      cep: destZip,
      note: 'Usando CEP de origem (teste local).',
    });
  }

  const code = String(serviceCode || CORREIOS_SERVICES.pac.contractCode).replace(/\D/g, '')
    || CORREIOS_SERVICES.pac.contractCode;

  const fakeOrder = {
    id: `TESTE-${Date.now().toString(36).slice(-8)}`.slice(0, 25),
    customer_name: 'TESTE PREPOSTAGEM ADMIN',
    customer_email: sender.email || 'teste@sorellepresentes.com.br',
    customer_phone: sender.phone?.number
      ? `${sender.phone.ddd || '11'}${sender.phone.number}`
      : '11999999999',
    shipping_service_code: code,
    total: 10,
    items: [{
      product_name: 'Teste prepostagem admin',
      quantity: 1,
      unit_price: 10,
      total: 10,
    }],
  };

  const payload = buildPrePostagemPayload(fakeOrder, {
    sender,
    recipient: {
      street: destStreet,
      number: destNumber,
      complement: '',
      district: destDistrict || 'Centro',
      city: destCity,
      state: destState,
      zip: destZip,
    },
    packageInfo: {
      weightKg: 0.3,
      height: 10,
      width: 15,
      length: 20,
    },
    serviceCode: code,
  });
  payload.observacao = truncate('TESTE ADMIN — cancelar', 50);

  const created = await correiosApiFetch('/v1/prepostagens', {
    method: 'POST',
    token: auth.token,
    body: payload,
  });

  if (!created.ok) {
    const apiMsg = extractCorreiosError(created.data, created.status, 'API de pré-postagem recusou o teste');
    const details = collectCorreiosMessages(created.data)
      .filter((m) => !/^ApiNegocioRuntimeException:?$/i.test(m));
    console.error('[Correios] Teste pré-postagem recusado', {
      status: created.status,
      serviceCode: code,
      apiMsg,
      body: created.data,
      payloadSummary: {
        codigoServico: payload.codigoServico,
        pesoInformado: payload.pesoInformado,
        remetenteCep: payload.remetente?.endereco?.cep,
        destinatarioCep: payload.destinatario?.endereco?.cep,
        remetenteCidade: payload.remetente?.endereco?.cidade,
        destinatarioCidade: payload.destinatario?.endereco?.cidade,
        cienteObjetoNaoProibido: payload.cienteObjetoNaoProibido,
      },
    });
    steps.push({
      name: 'criar_prepostagem',
      ok: false,
      status: created.status,
      endpoint: 'POST /prepostagem/v1/prepostagens',
      error: apiMsg,
      service_code: code,
      details,
    });
    return {
      ok: false,
      message: apiMsg,
      step_label: STEP_LABELS.criar_prepostagem,
      steps,
      details,
      next_steps: nextStepsForStep('criar_prepostagem', apiMsg),
      credentials,
      raw: created.data,
    };
  }

  const prepostagemId = created.data?.id
    || created.data?.idPrePostagem
    || created.data?.idPrepostagem
    || null;

  steps.push({
    name: 'criar_prepostagem',
    ok: true,
    status: created.status,
    endpoint: 'POST /prepostagem/v1/prepostagens',
    prepostagem_id: prepostagemId,
    service_code: code,
  });

  if (!prepostagemId) {
    return {
      ok: false,
      message: 'Pré-postagem criada sem id — não é possível emitir rótulo.',
      step_label: STEP_LABELS.criar_prepostagem,
      steps,
      next_steps: nextStepsForStep('criar_prepostagem'),
      credentials,
    };
  }

  const rotulo = await emitRotuloAndResolveCode(auth.token, prepostagemId);
  steps.push({
    name: 'emitir_rotulo',
    ok: rotulo.emit_ok,
    endpoint: 'POST /prepostagem/v1/prepostagens/rotulo/assincrono/pdf',
    id_recibo: rotulo.idRecibo || null,
    ...(rotulo.emit_ok
      ? {}
      : { error: extractCorreiosError(rotulo.raw?.emitir?.data || rotulo.raw?.emitir, rotulo.raw?.emitir?.status) }),
  });
  steps.push({
    name: 'baixar_rotulo',
    ok: rotulo.download_ok,
    endpoint: rotulo.idRecibo
      ? `GET /prepostagem/v1/prepostagens/rotulo/download/assincrono/${rotulo.idRecibo}`
      : 'GET /prepostagem/v1/prepostagens/rotulo/download/assincrono/{idRecibo}',
    pdf: rotulo.download_ok,
    tracking_code: rotulo.code || null,
    status_atual: rotulo.status_atual || null,
    ...(rotulo.download_ok
      ? {}
      : { error: rotulo.emit_ok ? 'PDF não ficou pronto a tempo (idRecibo obtido).' : 'Emissão do rótulo falhou.' }),
  });

  const trackingCode = rotulo.code || null;
  const cancel = await cancelPrePostagem(auth.token, {
    id: prepostagemId,
    codigoObjeto: trackingCode,
  });
  steps.push({
    name: 'cancelar_prepostagem',
    ok: cancel.ok,
    status: cancel.status,
    endpoint: cancel.by === 'codigoObjeto'
      ? `DELETE /prepostagem/v1/prepostagens/objeto/${trackingCode}`
      : `DELETE /prepostagem/v1/prepostagens/${prepostagemId}`,
    ...(cancel.ok
      ? {}
      : { error: extractCorreiosError(cancel.data, cancel.status, 'Não foi possível cancelar a pré-postagem de teste') }),
  });

  const flowOk = rotulo.emit_ok && Boolean(trackingCode || rotulo.download_ok);
  return {
    ok: flowOk,
    message: flowOk
      ? (cancel.ok
        ? 'Pré-postagem OK (manual): criar → rótulo → código/PDF → cancelar. Pode gerar nos pedidos.'
        : 'Fluxo de rótulo OK, mas o cancelamento automático falhou. Cancele no CWS se estiver pendente.')
      : 'Falha no fluxo de rótulo assíncrono. Veja as etapas abaixo.',
    steps,
    next_steps: flowOk
      ? (cancel.ok
        ? ['No pedido PAC/SEDEX, use Gerar código Correios.']
        : [
          'Cancele a pré-postagem de teste no CWS se ainda estiver ativa.',
          'No pedido PAC/SEDEX, use Gerar código Correios.',
        ])
      : nextStepsForStep(rotulo.emit_ok ? 'baixar_rotulo' : 'emitir_rotulo'),
    credentials,
    prepostagem_id: prepostagemId,
    id_recibo: rotulo.idRecibo || null,
    tracking_code: trackingCode,
    pdf_ok: rotulo.download_ok,
    cancelled: cancel.ok,
  };
}
