import { config } from '../config/env.js';
import { getSetting } from './settings.js';
import {
  addMessage,
  getConversationById,
  listMessages,
  setMessageWaId,
  updateBotState,
} from './chatStore.js';
import { emitChatMessage, emitConversationUpdate } from './realtime.js';
import {
  findProductByMention,
  getProductById,
  listFeaturedProducts,
  normalizeText,
  searchProducts,
  tokenizeQuery,
} from './productSearch.js';

const STORE = {
  name: 'Sorelle Presentes',
  city: 'Sacramento - MG',
  phone: '(34) 3351-1975',
  email: 'contato@sorellepresentes.com.br',
};

const OCCASIONS = [
  { id: 'aniversario', labels: ['aniversario', 'niver', 'aniversariante'] },
  { id: 'casamento', labels: ['casamento', 'noiva', 'noivos', 'boda'] },
  { id: 'mae', labels: ['mae', 'maes', 'mamae'] },
  { id: 'namorados', labels: ['namorado', 'namorada', 'namorados', 'esposa', 'marido'] },
  { id: 'casa', labels: ['casa', 'decoracao', 'decorar', 'lar', 'ambiente'] },
  { id: 'natal', labels: ['natal', 'fim de ano'] },
  { id: 'cha', labels: ['cha de bebe', 'cha revelacao', 'bebe'] },
];

const CATEGORY_HINTS = [
  { slug: 'casa', labels: ['casa', 'lar', 'cozinha', 'mesa'] },
  { slug: 'decoracao', labels: ['decoracao', 'vaso', 'escultura', 'objeto'] },
  { slug: 'fragancias', labels: ['fragrancia', 'vela', 'perfume', 'aroma', 'incenso'] },
  { slug: 'cama_mesa_banho', labels: ['cama', 'banho', 'toalha', 'lenco', 'roupa de cama'] },
];

function storeUrl(path = '') {
  const base = (config.frontendUrl || `https://${config.domain}` || 'https://sorellepresentes.com.br')
    .replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function firstName(conversation) {
  const name = String(conversation?.visitor_name || '').trim();
  if (!name) return '';
  return name.split(/\s+/)[0];
}

function greet(conversation) {
  const name = firstName(conversation);
  return name ? `Olá, ${name}!` : 'Olá!';
}

function extractBudget(text) {
  const normalized = normalizeText(text);
  const match = normalized.match(/(?:ate|por|uns|por volta de|em torno de)?\s*r?\$?\s*(\d{2,5})/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 20 ? value : null;
}

function detectOccasion(text) {
  const normalized = normalizeText(text);
  return OCCASIONS.find((item) => item.labels.some((label) => normalized.includes(label)))?.id || null;
}

function detectCategory(text) {
  const normalized = normalizeText(text);
  return CATEGORY_HINTS.find((item) => item.labels.some((label) => normalized.includes(label)))?.slug || null;
}

function wantsHuman(text) {
  const normalized = normalizeText(text);
  return [
    'atendente', 'humano', 'pessoa', 'vendedor', 'vendedora',
    'falar com alguem', 'falar com uma pessoa', 'nao e robo',
  ].some((term) => normalized.includes(term));
}

function wantsBotBack(text) {
  const normalized = normalizeText(text);
  return ['robo', 'assistente', 'voltar ao atendimento automatico'].some((term) => normalized.includes(term));
}

function isGreeting(text) {
  const normalized = normalizeText(text);
  return /^(oi+|ola+|hey|eai|e ai|bom dia|boa tarde|boa noite|hello)\b/.test(normalized)
    || normalized.length <= 12 && ['oi', 'ola', 'oie', 'opa'].includes(normalized);
}

function isThanks(text) {
  const normalized = normalizeText(text);
  return ['obrigad', 'valeu', 'agradec'].some((term) => normalized.includes(term));
}

function isClosing(text) {
  const normalized = normalizeText(text);
  return ['tchau', 'ate logo', 'ate mais', 'falou'].some((term) => normalized.includes(term));
}

function asksPrice(text) {
  const normalized = normalizeText(text);
  return ['preco', 'valor', 'quanto custa', 'quanto e', 'custa'].some((term) => normalized.includes(term));
}

function asksStock(text) {
  const normalized = normalizeText(text);
  return ['estoque', 'disponivel', 'disponivel', 'tem ai', 'ainda tem'].some((term) => normalized.includes(term));
}

function asksShipping(text) {
  const normalized = normalizeText(text);
  return ['frete', 'entrega', 'prazo', 'envio', 'correio', 'entregam'].some((term) => normalized.includes(term));
}

function asksPayment(text) {
  const normalized = normalizeText(text);
  return ['pix', 'cartao', 'parcel', 'boleto', 'pagamento', 'forma de pag'].some((term) => normalized.includes(term));
}

function asksReturn(text) {
  const normalized = normalizeText(text);
  return ['troca', 'devolucao', 'devolver', 'garantia'].some((term) => normalized.includes(term));
}

function looksLikeSearch(text) {
  const normalized = normalizeText(text);
  const tokens = tokenizeQuery(text);
  if (tokens.length >= 1 && [
    'procuro', 'quero', 'queria', 'gostaria', 'tem', 'vende', 'mostr', 'indica',
    'sugest', 'opcoes', 'opcao', 'presente', 'vela', 'vaso', 'kit',
  ].some((term) => normalized.includes(term))) {
    return true;
  }
  return tokens.length >= 2;
}

function productLink(product) {
  return storeUrl(`/produto/${product.id}`);
}

function formatProductCard(product, index) {
  const price = formatMoney(product.price);
  const original = product.original_price && product.original_price > product.price
    ? ` (de ${formatMoney(product.original_price)})`
    : '';
  const excerpt = String(product.description || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const lines = [
    `${index + 1}. *${product.name}* — ${price}${original}`,
  ];
  if (excerpt) lines.push(`   ${excerpt}${excerpt.length >= 120 ? '…' : ''}`);
  lines.push(`   ${productLink(product)}`);
  return lines.join('\n');
}

function formatProductList(products) {
  if (!products.length) return '';
  return products.map((product, index) => formatProductCard(product, index)).join('\n\n');
}

async function resolveFocusProduct(text, context) {
  const mentioned = await findProductByMention(text);
  if (mentioned) return mentioned;
  if (context.focusProductId) {
    const focused = await getProductById(context.focusProductId);
    if (focused) return focused;
  }
  return null;
}

function productAnswer(product, text) {
  const parts = [];
  if (asksPrice(text) || !text) {
    parts.push(`${product.name} custa ${formatMoney(product.price)}.`);
  }
  if (asksStock(text)) {
    parts.push(product.in_stock && product.quantity > 0
      ? `Está disponível (${product.quantity} un.).`
      : 'Esse item pode estar em falta agora. Posso indicar outro similar.');
  }
  if (product.materials && /material|feito|tecido|ceramica|vidro/.test(normalizeText(text))) {
    parts.push(`Materiais: ${product.materials}.`);
  }
  if (product.dimensions && /medida|tamanho|dimens/.test(normalizeText(text))) {
    parts.push(`Medidas: ${product.dimensions}.`);
  }
  if (product.care_instructions && /cuidar|lavar|conserv/.test(normalizeText(text))) {
    parts.push(`Cuidados: ${product.care_instructions}.`);
  }
  if (product.product_specifications && /especif|detalhe|tecnica/.test(normalizeText(text))) {
    parts.push(product.product_specifications);
  }
  if (!parts.length) {
    const excerpt = String(product.description || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    parts.push(excerpt || `${product.name} é uma escolha linda da Sorelle.`);
    parts.push(`Valor: ${formatMoney(product.price)}.`);
  }
  parts.push(`Veja fotos e detalhes: ${productLink(product)}`);
  return parts.join('\n');
}

async function recommend(conversation, context, query) {
  const searchQuery = [query, context.occasion, context.interests?.join(' ')].filter(Boolean).join(' ');
  let products = await searchProducts({
    query: searchQuery,
    category: context.category,
    budgetMax: context.budgetMax,
    limit: 3,
  });
  if (!products.length) {
    products = await listFeaturedProducts(3);
  }
  context.lastProductIds = products.map((item) => item.id);
  if (products[0]) context.focusProductId = products[0].id;
  return products;
}

function nextWarmupQuestion(context) {
  if (!context.occasion) {
    return 'É para alguma ocasião especial — aniversário, casa nova, casamento — ou um mimo para você?';
  }
  if (!context.budgetMax) {
    return 'Tem uma faixa de valor em mente? Por exemplo até 150, 250 ou 400 reais.';
  }
  if (!context.category && !context.interests?.length) {
    return 'Você prefere algo para casa, decoração ou fragrâncias (velas e aromas)?';
  }
  return null;
}

export async function isBotEnabled() {
  const value = await getSetting('whatsapp_bot_enabled');
  return value !== 'false';
}

export async function handleSalesBot({ conversation, inboundText }) {
  if (!conversation || conversation.bot_paused) return null;
  if (!(await isBotEnabled())) return null;

  const text = String(inboundText || '').trim();
  if (!text) return null;

  const context = { ...(conversation.bot_context || {}) };
  let stage = conversation.bot_stage || 'greeting';
  let paused = false;
  const name = firstName(conversation);

  if (wantsHuman(text)) {
    paused = true;
    stage = 'human';
    const reply = `${greet(conversation)} Vou chamar um atendente da Sorelle para continuar com você. Um momento, por favor.`;
    return { reply, stage, context, paused };
  }

  if (wantsBotBack(text)) {
    paused = false;
    stage = 'discover';
    return {
      reply: `${greet(conversation)} Voltei. Me conta o que você procura — posso indicar peças e enviar os links.`,
      stage,
      context,
      paused,
    };
  }

  const budget = extractBudget(text);
  if (budget) context.budgetMax = budget;
  const occasion = detectOccasion(text);
  if (occasion) context.occasion = occasion;
  const category = detectCategory(text);
  if (category) context.category = category;
  const tokens = tokenizeQuery(text);
  if (tokens.length) {
    context.interests = Array.from(new Set([...(context.interests || []), ...tokens])).slice(-12);
  }

  if (asksShipping(text)) {
    stage = 'qualify';
    return {
      reply: `Entregamos para todo o Brasil. O frete e o prazo aparecem no checkout com o CEP. Também temos retirada em ${STORE.city}. Quer que eu indique um produto para você calcular aí?`,
      stage,
      context,
      paused,
    };
  }

  if (asksPayment(text)) {
    stage = 'qualify';
    return {
      reply: 'Aceitamos Pix e cartão de crédito (com parcelamento conforme o valor). Você finaliza com segurança no site. Quer o link de alguma peça?',
      stage,
      context,
      paused,
    };
  }

  if (asksReturn(text)) {
    stage = 'qualify';
    return {
      reply: `Trabalhamos com troca e devolução. Os detalhes estão em ${storeUrl('/trocas-e-devolucoes')}. Se quiser, te mostro o produto e te ajudo a concluir a compra.`,
      stage,
      context,
      paused,
    };
  }

  const focus = await resolveFocusProduct(text, context);
  if (focus && (asksPrice(text) || asksStock(text) || /esse|dessa|desta|produto|peça|peca/.test(normalizeText(text)))) {
    context.focusProductId = focus.id;
    stage = 'qualify';
    return {
      reply: `${productAnswer(focus, text)}\n\nSe gostar, é só abrir o link e finalizar. Quer outra opção nessa linha?`,
      stage,
      context,
      paused,
    };
  }

  if (isThanks(text)) {
    return {
      reply: `Que bom, ${name || 'obrigada'}! Qualquer dúvida sobre a peça, é só falar. Quando quiser, finalizamos no site.`,
      stage: stage === 'greeting' ? 'discover' : stage,
      context,
      paused,
    };
  }

  if (isClosing(text)) {
    return {
      reply: `Até logo! A Sorelle está aqui quando quiser escolher o presente. ${storeUrl('/')}`,
      stage: 'close',
      context,
      paused,
    };
  }

  const history = await listMessages(conversation.id, { limit: 8 });
  const inboundCount = history.filter((item) => item.direction === 'inbound').length;
  const shouldGreet = inboundCount <= 1 || isGreeting(text);

  if (looksLikeSearch(text) || budget || occasion || category) {
    const products = await recommend(conversation, context, text);
    stage = 'recommend';
    const intro = shouldGreet
      ? `${greet(conversation)} Sou o atendimento da ${STORE.name}. Separei opções para você:`
      : 'Separei estas opções para você:';
    const question = nextWarmupQuestion(context);
    const close = question
      || 'Qual dessas te encantou? Posso contar mais sobre qualquer uma ou buscar outra faixa de valor.';
    return {
      reply: `${intro}\n\n${formatProductList(products)}\n\n${close}`,
      stage,
      context,
      paused,
    };
  }

  if (shouldGreet || stage === 'greeting') {
    stage = 'discover';
    return {
      reply: `${greet(conversation)} Sou o atendimento da ${STORE.name}. Ajudo você a escolher o presente certo — com links das peças e detalhes.\n\nMe conta: o que você procura hoje? Se preferir, diga a ocasião e um valor aproximado que eu já te mostro opções.`,
      stage,
      context,
      paused,
    };
  }

  const warmup = nextWarmupQuestion(context);
  if (warmup && stage !== 'recommend') {
    stage = 'discover';
    return { reply: warmup, stage, context, paused };
  }

  const products = await recommend(conversation, context, text);
  stage = 'recommend';
  return {
    reply: `Olha o que encontrei para você:\n\n${formatProductList(products)}\n\nSe quiser, falo do material, medidas ou te mando o link direto para finalizar a compra.`,
    stage,
    context,
    paused,
  };
}

export async function dispatchBotReply(conversation, result) {
  if (!result?.reply || !conversation) return null;

  const updated = await updateBotState(conversation.id, {
    stage: result.stage,
    context: result.context,
    paused: result.paused,
  });

  const message = await addMessage({
    conversationId: conversation.id,
    direction: 'outbound',
    source: 'bot',
    body: result.reply,
    incrementUnread: false,
  });
  if (!message) return null;

  const fresh = await getConversationById(conversation.id);
  emitChatMessage(fresh || updated || conversation, message);
  emitConversationUpdate(fresh || updated || conversation);

  try {
    const { sendWhatsApp, forwardSiteMessageToWhatsApp } = await import('./baileys.js');
    const sent = fresh?.visitor_jid
      ? await sendWhatsApp(fresh.visitor_jid, result.reply)
      : await forwardSiteMessageToWhatsApp(fresh || conversation, result.reply, { fromAdmin: true });
    if (sent?.key?.id) await setMessageWaId(message.id, sent.key.id);
  } catch (err) {
    console.error('[bot] Falha ao enviar resposta:', err.message);
  }

  return message;
}

export async function maybeRunSalesBot({ conversation, inboundText }) {
  try {
    const result = await handleSalesBot({ conversation, inboundText });
    if (!result) return null;
    return dispatchBotReply(conversation, result);
  } catch (err) {
    console.error('[bot] Erro no atendimento:', err.message);
    return null;
  }
}
