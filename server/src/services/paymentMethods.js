import { getSetting } from './settings.js';
import { getCieloConfig } from './cieloConfig.js';

export const PAYMENT_METHOD_DEFS = {
  pix: {
    id: 'pix',
    label: 'PIX',
    description: 'Pagamento instantâneo via Cielo',
    gateway: true,
    manualFallback: true,
  },
  cartao_credito: {
    id: 'cartao_credito',
    label: 'Cartão de crédito',
    description: 'Parcelamento via Checkout Cielo',
    gateway: true,
  },
  cartao_debito: {
    id: 'cartao_debito',
    label: 'Cartão de débito',
    description: 'Débito online via Checkout Cielo',
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
  { id: 'pix', label: 'PIX', hint: 'Checkout Cielo (ou chave PIX manual)' },
  { id: 'cartao_credito', label: 'Cartão de crédito', hint: 'Redireciona ao Checkout Cielo' },
  { id: 'cartao_debito', label: 'Cartão de débito', hint: 'Débito online via Checkout Cielo' },
  { id: 'boleto', label: 'Boleto bancário', hint: 'Redireciona ao Checkout Cielo' },
  { id: 'dinheiro', label: 'Dinheiro na retirada', hint: 'Disponível apenas com retirada na loja' },
  { id: 'pagar_na_loja', label: 'Pagar na loja', hint: 'Cliente paga ao retirar o pedido' },
  { id: 'test', label: 'Modo teste', hint: 'Aprova o pedido automaticamente, sem cobrança real' },
];

const DEFAULT_CHECKOUT_METHOD = 'pix';
const DEFAULT_ENABLED_METHODS = ['pix', 'cartao_credito'];
const CIELO_METHODS = ['cartao_credito', 'cartao_debito', 'boleto'];

async function getPixCredentials() {
  const pixKey = ((await getSetting('pix_key')) || process.env.PIX_KEY || '').trim();
  const pixHolder = ((await getSetting('pix_holder_name')) || process.env.PIX_HOLDER_NAME || 'Sorelle Presentes').trim();
  return { pixKey, pixHolder };
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

  const cieloConfig = await getCieloConfig();
  const { pixKey } = await getPixCredentials();

  if (methodId === 'pix') {
    return (def.gateway && cieloConfig.isReady) || (def.manualFallback && Boolean(pixKey));
  }

  if (CIELO_METHODS.includes(methodId)) {
    return def.gateway && cieloConfig.isReady;
  }

  return false;
}

async function resolveMethodProvider(methodId) {
  const def = PAYMENT_METHOD_DEFS[methodId];
  if (!def) return null;

  const cieloConfig = await getCieloConfig();
  const { pixKey, pixHolder } = await getPixCredentials();

  if (methodId === 'test') {
    return { provider: 'test', isTestMode: true };
  }

  if (methodId === 'dinheiro' || methodId === 'pagar_na_loja') {
    return { provider: 'pay_at_pickup', isTestMode: false, paymentMethod: methodId };
  }

  if (methodId === 'pix') {
    if (cieloConfig.isReady) {
      return { provider: 'cielo', isTestMode: false, cieloConfig };
    }
    if (pixKey) {
      return { provider: 'manual_pix', isTestMode: false, pixKey, pixHolder };
    }
    return null;
  }

  if (CIELO_METHODS.includes(methodId) && cieloConfig.isReady) {
    return { provider: 'cielo', isTestMode: false, cieloConfig };
  }

  return null;
}

export async function getCheckoutConfig() {
  const methodId = await getCheckoutPaymentMethod();
  const def = PAYMENT_METHOD_DEFS[methodId];
  const providerInfo = await resolveMethodProvider(methodId);

  return {
    method: methodId,
    ...def,
    available: Boolean(providerInfo),
    provider: providerInfo?.provider || null,
    isTestMode: providerInfo?.isTestMode || false,
    cieloConfig: providerInfo?.cieloConfig || null,
    pixKey: providerInfo?.pixKey || null,
    pixHolder: providerInfo?.pixHolder || null,
  };
}

/** Retorna formas de pagamento habilitadas e disponíveis para o cliente escolher. */
export async function getAvailablePaymentMethods({ pickup = false } = {}) {
  const enabled = await getEnabledPaymentMethodIds();
  const pixDiscountPercent = await getPixDiscountPercent();
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
