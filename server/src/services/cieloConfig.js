import { getSetting } from './settings.js';

/**
 * Configuração da API E-commerce Cielo (API 3.0).
 * @see https://docs.cielo.com.br/ecommerce-cielo/reference/sobre-a-api
 *
 * Autenticação: headers MerchantId (GUID 36) + MerchantKey (40 caracteres)
 * em todas as requisições.
 */
const MERCHANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MERCHANT_KEY_PATTERN = /^[A-Za-z0-9]{30,50}$/;

export const CIELO_ENVIRONMENTS = {
  production: {
    id: 'production',
    label: 'Produção',
    apiUrl: 'https://api.cieloecommerce.cielo.com.br',
    queryApiUrl: 'https://apiquery.cieloecommerce.cielo.com.br',
  },
  sandbox: {
    id: 'sandbox',
    label: 'Sandbox (testes)',
    apiUrl: 'https://apisandbox.cieloecommerce.cielo.com.br',
    queryApiUrl: 'https://apiquerysandbox.cieloecommerce.cielo.com.br',
  },
};

const DEFAULT_ENVIRONMENT = 'production';

export async function getCieloEnvironment() {
  const raw = ((await getSetting('cielo_environment')) || process.env.CIELO_ENVIRONMENT || DEFAULT_ENVIRONMENT)
    .trim()
    .toLowerCase();
  return CIELO_ENVIRONMENTS[raw] ? raw : DEFAULT_ENVIRONMENT;
}

export async function getCieloConfig() {
  const merchantId = ((await getSetting('cielo_merchant_id')) || process.env.CIELO_MERCHANT_ID || '').trim();
  const merchantKey = ((await getSetting('cielo_merchant_key')) || process.env.CIELO_MERCHANT_KEY || '').trim();
  const softDescriptor = ((await getSetting('cielo_soft_descriptor')) || process.env.CIELO_SOFT_DESCRIPTOR || 'SORELLE').trim();
  const frontendUrl = ((await getSetting('cielo_frontend_url')) || process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
  const backendPublicUrl = ((await getSetting('cielo_backend_public_url')) || process.env.APP_PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, '');
  const maxInstallments = Number((await getSetting('cielo_max_installments')) || process.env.CIELO_MAX_INSTALLMENTS || 12);
  const environment = await getCieloEnvironment();
  const envConfig = CIELO_ENVIRONMENTS[environment];

  const merchantIdValid = MERCHANT_ID_PATTERN.test(merchantId);
  const merchantKeyValid = MERCHANT_KEY_PATTERN.test(merchantKey);

  return {
    merchantId,
    merchantKey,
    merchantIdValid,
    merchantKeyValid,
    softDescriptor: softDescriptor.slice(0, 13),
    frontendUrl,
    backendPublicUrl,
    environment,
    environmentLabel: envConfig.label,
    environments: Object.values(CIELO_ENVIRONMENTS).map(({ id, label }) => ({ id, label })),
    apiUrl: envConfig.apiUrl,
    queryApiUrl: envConfig.queryApiUrl,
    maxInstallments: Math.min(12, Math.max(1, maxInstallments || 12)),
    returnUrlExample: `${frontendUrl}/pagamento/retorno?pedido=ID_DO_PEDIDO`,
    notificationUrl: `${backendPublicUrl}/api/checkout/cielo/notificacao`,
    isReady: merchantIdValid && merchantKeyValid,
  };
}

export function getCieloRequirements(config) {
  return [
    {
      id: 'merchant_id',
      label: 'MerchantId configurado (GUID de 36 caracteres)',
      required: true,
      done: Boolean(config.merchantIdValid),
      hint: 'Obtido no site Cielo em E-commerce → Gestão API E-commerce → Credenciais',
    },
    {
      id: 'merchant_key',
      label: 'MerchantKey configurada (chave de 40 caracteres)',
      required: true,
      done: Boolean(config.merchantKeyValid),
      hint: 'Gerada junto com o MerchantId no site Cielo',
    },
    {
      id: 'environment',
      label: `Ambiente: ${config.environmentLabel}`,
      required: true,
      done: true,
      hint: config.environment === 'sandbox'
        ? 'Sandbox usa credenciais próprias de teste — nenhuma cobrança real'
        : 'Produção — transações reais',
    },
    {
      id: 'notification',
      label: 'URL de notificação cadastrada no site Cielo',
      required: true,
      done: false,
      hint: `Cadastre no site Cielo (E-commerce → URL de notificações): ${config.notificationUrl}`,
      manual: true,
    },
    {
      id: 'payment_methods',
      label: 'Meios de pagamento habilitados na Cielo (crédito, Pix, boleto)',
      required: true,
      done: false,
      hint: 'Habilite os meios contratados no site Cielo antes de transacionar',
      manual: true,
    },
    {
      id: 'soft_descriptor',
      label: 'Soft Descriptor (nome na fatura, até 13 caracteres)',
      required: false,
      done: Boolean(config.softDescriptor),
      hint: `Atual: ${config.softDescriptor || '—'}`,
    },
  ];
}
