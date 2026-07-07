import pool from '../config/db.js';
import { toCieloAddress } from '../utils/address.js';
import { buildPackageFromProducts, CARRIER_SERVICE, getCorreiosConfig } from './correios.js';
import { getCorreiosApiBase, getCorreiosApiToken } from './correiosAuth.js';
import { getSetting } from './settings.js';
import { normalizeTrackingCode } from './correiosTracking.js';

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

function extractZipFromNotes(notes) {
  const match = String(notes || '').match(/CEP:\s*(\d{5}-?\d{3}|\d{8})/i);
  return match ? onlyDigits(match[1]).slice(0, 8) : '';
}

function parseRecipientAddress(order) {
  const parsed = toCieloAddress({ customer_address: order.customer_address });
  const zip = extractZipFromNotes(order.notes);

  return {
    street: parsed.Street,
    number: parsed.Number,
    complement: parsed.Complement || '',
    district: parsed.District,
    city: parsed.City,
    state: parsed.State,
    zip,
  };
}

async function getSenderConfig() {
  const correios = await getCorreiosConfig();
  const phone = splitPhone(
    (await getSetting('correios_sender_phone')) || process.env.CORREIOS_SENDER_PHONE || ''
  );

  return {
    name: truncate((await getSetting('correios_sender_name')) || process.env.CORREIOS_SENDER_NAME || 'Sorelle Presentes', 50),
    street: truncate((await getSetting('correios_sender_street')) || process.env.CORREIOS_SENDER_STREET || '', 50),
    number: truncate((await getSetting('correios_sender_number')) || process.env.CORREIOS_SENDER_NUMBER || 'S/N', 6),
    complement: truncate((await getSetting('correios_sender_complement')) || process.env.CORREIOS_SENDER_COMPLEMENT || '', 30),
    district: truncate((await getSetting('correios_sender_district')) || process.env.CORREIOS_SENDER_DISTRICT || 'Centro', 30),
    city: truncate((await getSetting('correios_sender_city')) || process.env.CORREIOS_SENDER_CITY || '', 30),
    state: truncate((await getSetting('correios_sender_state')) || process.env.CORREIOS_SENDER_STATE || 'SP', 2).toUpperCase(),
    zip: onlyDigits(correios.originZip).slice(0, 8),
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
    conteudo: truncate(item.product_name || 'Produto', 60),
    quantidade: String(Math.max(1, Number(item.quantity || 1))),
    valor: formatMoney(Number(item.unit_price || item.total || 0)),
  }));
}

function validatePrePostagemSetup({ sender, recipient, order, config }) {
  const missing = [];

  const postCard = (config.postCard || '').trim();
  const contract = (config.contractNumber || '').trim();
  if (!postCard && !contract) {
    missing.push('cartão de postagem ou número do contrato em Configurações → Frete');
  }

  if (!sender.name || sender.name.length < 3) missing.push('nome do remetente');
  if (!sender.street) missing.push('logradouro do remetente');
  if (!sender.city) missing.push('cidade do remetente');
  if (!sender.state) missing.push('UF do remetente');
  if (sender.zip.length !== 8) missing.push('CEP de origem válido');

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
    cienteObjetoNaoProibido: '1',
    logisticaReversa: 'N',
    itensDeclaracaoConteudo: buildDeclarationItems(order),
    pedidoExternoOrigem: truncate(order.id, 25),
    observacao: truncate(`Pedido ${order.id}`, 50),
  };
}

function extractCorreiosError(body, status) {
  if (Array.isArray(body?.msgs) && body.msgs.length > 0) {
    return body.msgs.join('; ');
  }
  if (body?.message) return body.message;
  if (body?.causa) return body.causa;
  return `Erro na API de pré-postagem (${status})`;
}

export async function generateCorreiosTrackingCode(order) {
  const config = await getPrePostagemConfig();
  const sender = await getSenderConfig();
  const recipient = parseRecipientAddress(order);
  validatePrePostagemSetup({ sender, recipient, order, config });

  const token = await getCorreiosApiToken({ forPostagem: true });
  if (!token) {
    throw new Error('Configure usuário e senha da API Correios em Configurações → Frete.');
  }

  const packageInfo = await buildPackageFromOrder(order, config);
  const payload = buildPrePostagemPayload(order, {
    sender,
    recipient,
    packageInfo,
    serviceCode: String(order.shipping_service_code).trim(),
  });

  const response = await fetch(`${getCorreiosApiBase()}/prepostagem/v1/prepostagens`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractCorreiosError(body, response.status));
  }

  const trackingCode = normalizeTrackingCode(body.codigoObjeto);
  if (!trackingCode) {
    throw new Error('A API dos Correios não retornou o código de rastreio.');
  }

  return {
    tracking_code: trackingCode,
    prepostagem_id: body.id || null,
    service_code: body.codigoServico || payload.codigoServico,
    status: body.descStatusAtual || body.statusAtual || null,
    raw: body,
  };
}
