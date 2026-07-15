import { getSetting } from './settings.js';
import { getCieloConfig } from './cieloConfig.js';
import { getSipagConfig, getPaymentGateway, PAYMENT_GATEWAYS } from './sipagConfig.js';

export const PAYMENT_METHOD_DEFS = {
  pix: {
    id: 'pix',
    label: 'PIX',
    description: 'Pagamento instantâneo via gateway',
    gateway: true,
    manualFallback: true,
  },
  cartao_credito: {
    id: 'cartao_credito',
    label: 'Cartão de crédito',
    description: 'Parcelamento no gateway de pagamento',
    gateway: true,
  },
  cartao_debito: {
    id: 'cartao_debito',
    label: 'Cartão de débito',
    description: 'Débito online no gateway de pagamento',
    gateway: true,
  },
  boleto: {
    id: 'boleto',
    label: 'Boleto bancário',
    description: 'Compensação em até 3 dias úteis',
    gateway: true,
  },
  dinheiro: {
    id: 'dinheiro',
    label: 'Dinheiro',
    description: 'Pague em dinheiro na retirada',
    pickupOnly: true,
  },
  pagar_na_loja: {
    id: 'pagar_na_loja',
    label: 'Pagar na loja',
    description: 'PIX, cartão ou dinheiro ao retirar o pedido',
    pickupOnly: true,
  },
  test: {
    id: 'test',
    label: 'Modo teste',
    description: 'Simula pagamento aprovado (desenvolvimento)',
    gateway: false,
    manualFallback: false,
    isTest: true,
  },
};

export const CHECKOUT_OPTIONS = [
  { id: 'pix', label: 'PIX', hint: 'Gateway (Cielo/SiPag) ou chave PIX manual' },
  { id: 'cartao_credito', label: 'Cartão de crédito', hint: 'Redireciona ao gateway configurado' },
  { id: 'cartao_debito', label: 'Cartão de débito', hint: 'Débito online no gateway configurado' },
  { id: 'boleto', label: 'Boleto bancário', hint: 'Redireciona ao gateway configurado' },
  { id: 'dinheiro', label: 'Dinheiro na retirada', hint: 'Disponível apenas com retirada na loja' },
  { id: 'pagar_na_loja', label: 'Pagar na loja', hint: 'Cliente paga ao retirar o pedido' },
  { id: 'test', label: 'Modo teste', hint: 'Aprova o pedido automaticamente, sem cobrança real' },
];

const DEFAULT_CHECKOUT_METHOD = 'pix';
const DEFAULT_ENABLED_METHODS = ['pix', 'cartao_credito'];
const GATEWAY_METHODS = ['cartao_credito', 'cartao_debito', 'boleto'];

async function getPixCredentials() {
  const pixKey = ((await getSetting('pix_key')) || process.env.PIX_KEY || '').trim();
  const pixHolder = ((await getSetting('pix_holder_name')) || process.env.PIX_HOLDER_NAME || 'Sorelle Presentes').trim();
  return { pixKey, pixHolder };
}

async function getActiveGatewayProvider() {
  const preferred = await getPaymentGateway();
  const cieloConfig = await getCieloConfig();
  const sipagConfig = await getSipagConfig();

  if (preferred === 'sipag' && sipagConfig.isReady) {
    return { provider: 'sipag', sipagConfig, cieloConfig };
  }
  if (preferred === 'cielo' && cieloConfig.isReady) {
    return { provider: 'cielo', cieloConfig, sipagConfig };
  }
  if (sipagConfig.isReady) {
    return { provider: 'sipag', sipagConfig, cieloConfig };
  }
  if (cieloConfig.isReady) {
    return { provider: 'cielo', cieloConfig, sipagConfig };
  }
  return null;
}

/** IDs habilitados pelo admin (fallback: método único legado). */
export async function getEnabledPaymentMethodIds() {
  const raw = await getSetting('payment_methods_enabled');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((id) => PAYMENT_METHOD_DEFS[id]);
      }
    } catch {
      // ignora JSON inválido
    }
  }

  const single = (await getSetting('checkout_payment_method'))
    || process.env.CHECKOUT_PAYMENT_METHOD
    || DEFAULT_CHECKOUT_METHOD;

  if (PAYMENT_METHOD_DEFS[single] && single !== DEFAULT_CHECKOUT_METHOD) {
    return [single];
  }

  return DEFAULT_ENABLED_METHODS;
}

export async function getCheckoutPaymentMethod() {
  const enabled = await getEnabledPaymentMethodIds();
  return enabled[0] || DEFAULT_CHECKOUT_METHOD;
}

async function isMethodAvailable(methodId) {
  const def = PAYMENT_METHOD_DEFS[methodId];
  if (!def) return false;

  if (methodId === 'test') return true;
  if (methodId === 'dinheiro' || methodId === 'pagar_na_loja') return true;

  const gateway = await getActiveGatewayProvider();
  const { pixKey } = await getPixCredentials();

  if (methodId === 'pix') {
    return Boolean(gateway) || (def.manualFallback && Boolean(pixKey));
  }

  if (GATEWAY_METHODS.includes(methodId)) {
    return Boolean(gateway);
  }

  return false;
}

async function resolveMethodProvider(methodId) {
  const def = PAYMENT_METHOD_DEFS[methodId];
  if (!def) return null;

  const gateway = await getActiveGatewayProvider();
  const { pixKey, pixHolder } = await getPixCredentials();

  if (methodId === 'test') {
    return { provider: 'test', isTestMode: true };
  }

  if (methodId === 'dinheiro' || methodId === 'pagar_na_loja') {
    return { provider: 'pay_at_pickup', isTestMode: false, paymentMethod: methodId };
  }

  if (methodId === 'pix') {
    if (gateway) {
      return { provider: gateway.provider, isTestMode: false, ...gateway };
    }
    if (pixKey) {
      return { provider: 'manual_pix', isTestMode: false, pixKey, pixHolder };
    }
    return null;
  }

  if (GATEWAY_METHODS.includes(methodId) && gateway) {
    return { provider: gateway.provider, isTestMode: false, ...gateway };
  }

  return null;
}

export async function getCheckoutConfig() {
  const methodId = await getCheckoutPaymentMethod();
  const def = PAYMENT_METHOD_DEFS[methodId];
  const providerInfo = await resolveMethodProvider(methodId);
  const gateway = await getPaymentGateway();

  return {
    method: methodId,
    ...def,
    available: Boolean(providerInfo),
    provider: providerInfo?.provider || null,
    payment_gateway: gateway,
    isTestMode: providerInfo?.isTestMode || false,
    cieloConfig: providerInfo?.cieloConfig || null,
    sipagConfig: providerInfo?.sipagConfig || null,
    pixKey: providerInfo?.pixKey || null,
    pixHolder: providerInfo?.pixHolder || null,
  };
}

/** Retorna formas de pagamento habilitadas e disponíveis para o cliente escolher. */
export async function getAvailablePaymentMethods({ pickup = false } = {}) {
  const enabled = await getEnabledPaymentMethodIds();
  const pixDiscountPercent = await getPixDiscountPercent();
  const cieloConfig = await getCieloConfig();
  const methods = [];

  for (const methodId of enabled) {
    const def = PAYMENT_METHOD_DEFS[methodId];
    if (!def) continue;
    if (def.pickupOnly && !pickup) continue;

    if (!(await isMethodAvailable(methodId))) continue;

    const providerInfo = await resolveMethodProvider(methodId);
    if (!providerInfo) continue;

    methods.push({
      id: methodId,
      label: def.label,
      description: def.description,
      provider: providerInfo.provider,
      isTestMode: providerInfo.isTestMode || false,
      pickup_only: Boolean(def.pickupOnly),
      pix_discount_percent: methodId === 'pix' ? pixDiscountPercent : 0,
      max_installments: methodId === 'cartao_credito' ? cieloConfig.maxInstallments : undefined,
    });
  }

  return methods;
}

export async function getPixDiscountPercent() {
  const raw = (await getSetting('pix_discount_percent')) || process.env.PIX_DISCOUNT_PERCENT || '0';
  return Math.min(100, Math.max(0, Number(raw) || 0));
}

/** Condições de pagamento exibidas na loja (público). */
export async function getPublicPaymentConditions() {
  const cieloConfig = await getCieloConfig();
  const enabledMethods = await getEnabledPaymentMethodIds();
  const pixDiscountPercent = await getPixDiscountPercent();
  const maxInstallments = cieloConfig.maxInstallments;

  return {
    max_installments: maxInstallments,
    pix_discount_percent: pixDiscountPercent,
    checkout_method: await getCheckoutPaymentMethod(),
    payment_methods_enabled: enabledMethods,
    payment_gateway: await getPaymentGateway(),
    shows_installments: maxInstallments >= 2 && enabledMethods.includes('cartao_credito'),
    shows_pix_discount: pixDiscountPercent > 0 && enabledMethods.includes('pix'),
  };
}

export async function resolvePaymentProvider(paymentMethod) {
  const enabled = await getEnabledPaymentMethodIds();
  if (!enabled.includes(paymentMethod)) {
    throw new Error('Forma de pagamento não disponível');
  }

  if (!(await isMethodAvailable(paymentMethod))) {
    throw new Error('Esta forma de pagamento não está configurada. Acesse Configurações no admin.');
  }

  const providerInfo = await resolveMethodProvider(paymentMethod);
  if (!providerInfo) {
    throw new Error('Esta forma de pagamento não está configurada. Acesse Configurações no admin.');
  }

  return providerInfo;
}

export { PAYMENT_GATEWAYS, getPaymentGateway };
