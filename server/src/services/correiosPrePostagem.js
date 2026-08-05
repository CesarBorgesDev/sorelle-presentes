import pool from '../config/db.js';
import { parseOrderRecipientAddress } from '../utils/address.js';
import {
  buildPackageFromProducts,
  CARRIER_SERVICE,
  CORREIOS_SERVICES,
  fetchAddressByCep,
  getCorreiosConfig,
} from './correios.js';
import { getCorreiosApiBase, getCorreiosApiToken } from './correiosAuth.js';
import { getSetting } from './settings.js';
import { normalizeTrackingCode } from './correiosTracking.js';

const SERVICE_CODE_TO_CONTRACT = {
  [CORREIOS_SERVICES.pac.code]: CORREIOS_SERVICES.pac.contractCode,
  [CORREIOS_SERVICES.sedex.code]: CORREIOS_SERVICES.sedex.contractCode,
  pac: CORREIOS_SERVICES.pac.contractCode,
  sedex: CORREIOS_SERVICES.sedex.contractCode,
};

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function truncate(value, max) {
  return String(value || '').trim().slice(0, max);
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
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
  const data = await response.json().catch(() => ({}));
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

async function requestRotuloAndResolveCode(token, prepostagemId) {
  // 1) Endpoint síncrono citado no manual (pode não existir em todas as versões)
  const sync = await correiosApiFetch('/v1/prepostagens/rotulo', {
    method: 'POST',
    token,
    body: {
      idsPrePostagem: [prepostagemId],
      tipoRotulo: 'P',
      formatoRotulo: 'ET',
    },
  });
  let code = extractTrackingCodeFromPayload(sync.data);
  if (code) return { code, raw: sync.data };

  // 2) Emissão assíncrona de PDF/rótulo — dispara atribuição do código do objeto
  const asyncReq = await correiosApiFetch('/v1/prepostagens/rotulo/assincrono/pdf', {
    method: 'POST',
    token,
    body: {
      idsPrePostagem: [prepostagemId],
      tipoRotulo: 'P',
      formatoRotulo: 'ET',
    },
  });
  code = extractTrackingCodeFromPayload(asyncReq.data);
  if (code) return { code, raw: asyncReq.data };

  // 3) Consulta a pré-postagem (o código costuma aparecer após solicitar o rótulo)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
    const refreshed = await fetchPrePostagemById(token, prepostagemId);
    code = extractTrackingCodeFromPayload(refreshed);
    if (code) return { code, raw: refreshed };
  }

  return {
    code: '',
    raw: {
      sync_status: sync.status,
      sync_body: sync.data,
      async_status: asyncReq.status,
      async_body: asyncReq.data,
    },
  };
}

function validatePrePostagemSetup({ sender, recipient, order, config }) {
  const missing = [];

  const postCard = (config.postCard || '').trim();
  const contract = (config.contractNumber || '').trim();
  if (!postCard && !contract) {
    missing.push('cartão de postagem ou número do contrato em Configurações → Frete');
  }

  if (!sender.name || sender.name.length < 3) {
    missing.push('nome do remetente (Configurações → Frete → Remetente)');
  }
  if (!sender.street) {
    missing.push('logradouro do remetente (aba Remetente — o endereço da retirada na loja não é usado aqui)');
  }
  if (!sender.city) {
    missing.push('cidade do remetente (aba Remetente)');
  }
  if (!sender.state) missing.push('UF do remetente (aba Remetente)');
  if (sender.zip.length !== 8) missing.push('CEP de origem válido (aba Correios)');

  if (!order.customer_name) missing.push('nome do destinatário');
  if (!recipient.street) missing.push('endereço do destinatário');
  if (!recipient.city) missing.push('cidade do destinatário');
  if (!recipient.state) missing.push('UF do destinatário');
  if (recipient.zip.length !== 8) missing.push('CEP do destinatário (confira as observações do pedido)');

  const serviceCode = String(order.shipping_service_code || '').trim();
  if (!serviceCode || serviceCode === CARRIER_SERVICE.code) {
    missing.push('serviço Correios (PAC/SEDEX) no pedido');
  }

  if (missing.length > 0) {
    throw new Error(`Configure ou corrija: ${missing.join(', ')}.`);
  }
}

async function getPrePostagemConfig() {
  const correios = await getCorreiosConfig();
  return {
    ...correios,
    postCard: ((await getSetting('correios_post_card')) || process.env.CORREIOS_POST_CARD || '').trim(),
    contractNumber: (
      (await getSetting('correios_contract_number'))
      || (await getSetting('correios_company_code'))
      || process.env.CORREIOS_CONTRACT_NUMBER
      || process.env.CORREIOS_COMPANY_CODE
      || ''
    ).trim(),
  };
}

function buildPrePostagemPayload(order, { sender, recipient, packageInfo, serviceCode }) {
  const phone = sender.phone.number.length >= 8
    ? {
        dddTelefone: sender.phone.ddd,
        telefone: sender.phone.number.slice(-8),
      }
    : {};

  return {
    remetente: {
      nome: sender.name,
      email: sender.email,
      ...(sender.cnpj ? { cpfCnpj: sender.cnpj } : {}),
      ...phone,
      endereco: {
        cep: sender.zip,
        logradouro: sender.street,
        numero: sender.number,
        complemento: sender.complement || undefined,
        bairro: sender.district,
        cidade: sender.city,
        uf: sender.state,
      },
    },
    destinatario: {
      nome: truncate(order.customer_name, 50),
      email: truncate(order.customer_email, 255) || undefined,
      endereco: {
        cep: recipient.zip,
        logradouro: truncate(recipient.street, 50),
        numero: truncate(recipient.number, 6),
        complemento: truncate(recipient.complement, 30) || undefined,
        bairro: truncate(recipient.district, 30),
        cidade: truncate(recipient.city, 30),
        uf: truncate(recipient.state, 2).toUpperCase(),
        regiao: truncate(recipient.city, 50),
      },
    },
    codigoServico: serviceCode,
    pesoInformado: String(Math.max(1, Math.round(packageInfo.weightKg * 1000))),
    codigoFormatoObjetoInformado: '2',
    alturaInformada: String(Math.max(2, Math.round(packageInfo.height))),
    larguraInformada: String(Math.max(11, Math.round(packageInfo.width))),
    comprimentoInformado: String(Math.max(16, Math.round(packageInfo.length))),
    cienteObjetoNaoProibido: 1,
    logisticaReversa: 'N',
    itensDeclaracaoConteudo: buildDeclarationItems(order),
    controleCliente: truncate(order.id, 30),
    observacao: truncate(`Pedido ${order.id}`, 50),
  };
}

function collectCorreiosMessages(value, bag = [], depth = 0) {
  if (value == null || depth > 4) return bag;

  if (typeof value === 'string') {
    const text = value.trim();
    if (text && text !== 'null' && text !== 'undefined' && !bag.includes(text)) {
      bag.push(text);
    }
    return bag;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectCorreiosMessages(item, bag, depth + 1);
    return bag;
  }

  if (typeof value === 'object') {
    for (const key of ['msgs', 'message', 'causa', 'msg', 'erro', 'error', 'detail', 'details']) {
      if (value[key] != null) collectCorreiosMessages(value[key], bag, depth + 1);
    }
  }

  return bag;
}

function extractCorreiosError(body, status, fallback = 'Erro na API de pré-postagem') {
  const messages = collectCorreiosMessages(body);
  if (messages.length > 0) return messages.join('; ');
  if (status) return `${fallback} (HTTP ${status})`;
  return fallback;
}

function throwCorreiosError({ message, details = [], step = null, status = null, raw = null }) {
  const uniqueDetails = [...new Set(
    details
      .flatMap((item) => collectCorreiosMessages(item))
      .map((item) => String(item).trim())
      .filter((item) => item && item !== 'null' && item !== 'undefined')
  )];

  const err = new Error(message || uniqueDetails[0] || 'Erro ao gerar código Correios');
  err.code = 'CORREIOS_PREPOSTAGEM';
  err.details = uniqueDetails;
  err.step = step;
  err.status = status;
  err.raw = raw;
  throw err;
}

export async function generateCorreiosTrackingCode(order) {
  try {
    const config = await getPrePostagemConfig();
    const sender = await getSenderConfig();
    const recipient = parseRecipientAddress(order);
    validatePrePostagemSetup({ sender, recipient, order, config });

    const token = await getCorreiosApiToken({ forPostagem: true });
    if (!token) {
      throwCorreiosError({
        message: 'Credenciais da API Correios não configuradas.',
        details: [
          'Preencha usuário Meu Correios e código de acesso CWS em Configurações → Frete → API Correios.',
          'Salve as configurações e use “Testar API” antes de gerar o código.',
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
      throwCorreiosError({
        message: 'Os Correios recusaram a criação da pré-postagem.',
        details: [
          extractCorreiosError(created.data, created.status),
          `Serviço enviado: ${serviceCode}`,
          'Confira remetente, destinatário, CEP e se o serviço está liberado no cartão/contrato.',
        ],
        step: 'criar_prepostagem',
        status: created.status,
        raw: created.data,
      });
    }

    let body = created.data || {};
    let trackingCode = extractTrackingCodeFromPayload(body);
    const prepostagemId = body.id || body.idPrePostagem || body.idPrepostagem || null;

    // Às vezes o create devolve só o id; o código surge na consulta ou ao emitir o rótulo
    if (!trackingCode && prepostagemId) {
      const refreshed = await fetchPrePostagemById(token, prepostagemId);
      if (refreshed) {
        body = { ...body, ...refreshed };
        trackingCode = extractTrackingCodeFromPayload(refreshed);
      }
    }

    let rotuloRaw = null;
    if (!trackingCode && prepostagemId) {
      const fromRotulo = await requestRotuloAndResolveCode(token, prepostagemId);
      rotuloRaw = fromRotulo.raw;
      if (fromRotulo.code) {
        trackingCode = fromRotulo.code;
        body = { ...body, rotulo: fromRotulo.raw };
      } else {
        console.warn('[Correios] Pré-postagem sem codigoObjeto', {
          prepostagemId,
          status: body.statusAtual || body.descStatusAtual,
          createKeys: Object.keys(created.data || {}),
          rotulo: fromRotulo.raw,
        });
      }
    }

    if (!trackingCode) {
      const statusLabel = body.statusAtual || body.descStatusAtual || 'desconhecido';
      const rotuloMsgs = collectCorreiosMessages(rotuloRaw);
      throwCorreiosError({
        message: 'A pré-postagem foi criada, mas o código de rastreio não foi gerado.',
        details: [
          prepostagemId ? `ID da pré-postagem: ${prepostagemId}` : null,
          `Status na API: ${statusLabel}`,
          `Serviço: ${serviceCode}`,
          ...rotuloMsgs,
          'Verifique no CWS: saldo de etiquetas do cartão e liberação do serviço no contrato.',
          'Depois tente novamente em alguns segundos.',
        ].filter(Boolean),
        step: 'codigo_objeto',
        raw: { create: body, rotulo: rotuloRaw },
      });
    }

    return {
      tracking_code: trackingCode,
      prepostagem_id: prepostagemId,
      service_code: body.codigoServico || payload.codigoServico,
      status: body.descStatusAtual || body.statusAtual || null,
      raw: body,
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
