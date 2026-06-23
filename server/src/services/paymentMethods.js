import { getSetting } from './settings.js';
import { getCieloConfig } from './cieloConfig.js';

export const PAYMENT_METHOD_DEFS = {
  pix: {
    id: 'pix',
    label: 'PIX',
    description: 'Pagamento instantâneo',
    gateway: true,
    manualFallback: true,
  },
  cartao_credito: {
    id: 'cartao_credito',
    label: 'Cartão de crédito',
    description: 'Parcelamento via Cielo',
    gateway: true,
  },
  boleto: {
    id: 'boleto',
    label: 'Boleto bancário',
    description: 'Compensação em até 3 dias úteis',
    gateway: true,
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
  { id: 'pix', label: 'PIX', hint: 'Cielo (se configurada) ou chave PIX manual' },
  { id: 'cartao_credito', label: 'Cartão de crédito', hint: 'Redireciona ao checkout Cielo' },
  { id: 'boleto', label: 'Boleto bancário', hint: 'Redireciona ao checkout Cielo' },
  { id: 'test', label: 'Modo teste', hint: 'Aprova o pedido automaticamente, sem cobrança real' },
];

const DEFAULT_CHECKOUT_METHOD = 'pix';

export async function getCheckoutPaymentMethod() {
  const configured = (await getSetting('checkout_payment_method')) || process.env.CHECKOUT_PAYMENT_METHOD || DEFAULT_CHECKOUT_METHOD;
  return PAYMENT_METHOD_DEFS[configured] ? configured : DEFAULT_CHECKOUT_METHOD;
}

export async function getCheckoutConfig() {
  const methodId = await getCheckoutPaymentMethod();
  const def = PAYMENT_METHOD_DEFS[methodId];
  const cieloConfig = await getCieloConfig();
  const pixKey = ((await getSetting('pix_key')) || process.env.PIX_KEY || '').trim();
  const pixHolder = ((await getSetting('pix_holder_name')) || process.env.PIX_HOLDER_NAME || 'Sorelle Presentes').trim();

  if (methodId === 'test') {
    return {
      method: methodId,
      ...def,
      available: true,
      provider: 'test',
      isTestMode: true,
    };
  }

  const viaCielo = def.gateway && cieloConfig.isReady;
  const viaManualPix = methodId === 'pix' && def.manualFallback && Boolean(pixKey);

  return {
    method: methodId,
    ...def,
    available: viaCielo || viaManualPix,
    provider: viaCielo ? 'cielo' : viaManualPix ? 'manual_pix' : null,
    isTestMode: false,
    cieloConfig: viaCielo ? cieloConfig : null,
    pixKey: viaManualPix ? pixKey : null,
    pixHolder: viaManualPix ? pixHolder : null,
  };
}

/** Retorna a forma de pagamento configurada (única) para exibir no checkout. */
export async function getAvailablePaymentMethods() {
  const config = await getCheckoutConfig();
  if (!config.available) return [];
  return [{
    id: config.method,
    label: config.label,
    description: config.description,
    provider: config.provider,
    isTestMode: config.isTestMode,
  }];
}

export async function resolvePaymentProvider(paymentMethod) {
  const configured = await getCheckoutPaymentMethod();
  if (paymentMethod !== configured) {
    throw new Error('Forma de pagamento não corresponde à configuração da loja');
  }

  const config = await getCheckoutConfig();
  if (!config.available) {
    throw new Error('Checkout não configurado. Acesse Admin → Configurações.');
  }

  if (config.provider === 'test') {
    return { provider: 'test' };
  }

  if (config.provider === 'cielo') {
    return { provider: 'cielo', cieloConfig: config.cieloConfig };
  }

  if (config.provider === 'manual_pix') {
    return { provider: 'manual_pix', pixKey: config.pixKey, pixHolder: config.pixHolder };
  }

  throw new Error('Esta forma de pagamento não está configurada. Acesse Configurações no admin.');
}
