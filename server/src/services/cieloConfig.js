import { getSetting } from './settings.js';

const DEFAULT_CHECKOUT_URL = 'https://cieloecommerce.cielo.com.br/api/public/v1/orders/';
const DEFAULT_TOKEN_URL = 'https://cieloecommerce.cielo.com.br/api/public/v2/token';
const DEFAULT_TRANSACTIONAL_URL = 'https://cieloecommerce.cielo.com.br/api/public/v2/';
const MERCHANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CIELO_NOTIFICATION_METHODS = {
  post: {
    id: 'post',
    label: 'POST (form-data)',
    description: 'Campos enviados diretamente no body (recomendado)',
  },
  json: {
    id: 'json',
    label: 'JSON (com URL de consulta)',
    description: 'Cielo envia MerchantOrderNumber + Url para consulta GET',
  },
};

const DEFAULT_NOTIFICATION_METHOD = 'post';

export async function getCieloNotificationMethod() {
  const raw = ((await getSetting('cielo_notification_method')) || process.env.CIELO_NOTIFICATION_METHOD || DEFAULT_NOTIFICATION_METHOD).trim().toLowerCase();
  return CIELO_NOTIFICATION_METHODS[raw] ? raw : DEFAULT_NOTIFICATION_METHOD;
}

function normalizeCheckoutApiUrl(url) {
  const trimmed = String(url || DEFAULT_CHECKOUT_URL).trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function normalizeTransactionalApiUrl(url) {
  const trimmed = String(url || DEFAULT_TRANSACTIONAL_URL).trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export async function getCieloConfig() {
  const merchantId = ((await getSetting('cielo_merchant_id')) || process.env.CIELO_MERCHANT_ID || '').trim();
  const clientId = ((await getSetting('cielo_client_id')) || process.env.CIELO_CLIENT_ID || '').trim();
  const clientSecret = ((await getSetting('cielo_client_secret')) || process.env.CIELO_CLIENT_SECRET || '').trim();
  const softDescriptor = ((await getSetting('cielo_soft_descriptor')) || process.env.CIELO_SOFT_DESCRIPTOR || 'SORELLE').trim();
  const frontendUrl = ((await getSetting('cielo_frontend_url')) || process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
  const backendPublicUrl = ((await getSetting('cielo_backend_public_url')) || process.env.APP_PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, '');
  const checkoutApiUrl = normalizeCheckoutApiUrl(
    (await getSetting('cielo_checkout_api_url')) || process.env.CIELO_CHECKOUT_URL || DEFAULT_CHECKOUT_URL
  );
  const tokenUrl = ((await getSetting('cielo_token_url')) || process.env.CIELO_TOKEN_URL || DEFAULT_TOKEN_URL).trim();
  const transactionalApiUrl = normalizeTransactionalApiUrl(
    (await getSetting('cielo_transactional_api_url')) || process.env.CIELO_TRANSACTIONAL_URL || DEFAULT_TRANSACTIONAL_URL
  );
  const maxInstallments = Number((await getSetting('cielo_max_installments')) || process.env.CIELO_MAX_INSTALLMENTS || 12);
  const notificationMethod = await getCieloNotificationMethod();

  const merchantIdValid = MERCHANT_ID_PATTERN.test(merchantId);
  const hasTransactionalCredentials = Boolean(clientId && clientSecret);

  return {
    merchantId,
    merchantIdValid,
    clientId,
    clientSecret,
    hasTransactionalCredentials,
    softDescriptor: softDescriptor.slice(0, 13),
    frontendUrl,
    backendPublicUrl,
    checkoutApiUrl,
    tokenUrl,
    transactionalApiUrl,
    maxInstallments: Math.min(12, Math.max(1, maxInstallments || 12)),
    notificationMethod,
    notificationMethodLabel: CIELO_NOTIFICATION_METHODS[notificationMethod].label,
    checkoutApiMethod: 'POST',
    checkoutApiContentType: 'application/json',
    notificationMethods: Object.values(CIELO_NOTIFICATION_METHODS),
    returnUrlExample: `${frontendUrl}/pagamento/retorno?pedido=ID_DO_PEDIDO`,
    notificationUrl: `${backendPublicUrl}/api/checkout/cielo/notificacao`,
    statusChangeUrl: `${backendPublicUrl}/api/checkout/cielo/mudanca-status`,
    isReady: merchantIdValid,
  };
}

export function getCieloRequirements(config) {
  return [
    {
      id: 'merchant_id',
      label: 'MerchantId configurado (GUID de 36 caracteres)',
      required: true,
      done: Boolean(config.merchantIdValid),
      hint: 'Obtido no site Cielo em E-commerce → Checkout → Configurações',
    },
    {
      id: 'client_credentials',
      label: 'ClientID e ClientSecret configurados (API de Controle Transacional)',
      required: true,
      done: Boolean(config.hasTransactionalCredentials),
      hint: 'Recebidos por e-mail após gerar credenciais em Checkout → Dados Cadastrais',
    },
    {
      id: 'frontend_url',
      label: 'URL do site (retorno após pagamento)',
      required: true,
      done: Boolean(config.frontendUrl),
      hint: 'Ex.: https://loja.sorelle.com.br ou http://localhost:3000',
    },
    {
      id: 'backend_url',
      label: 'URL pública do backend (notificações)',
      required: true,
      done: Boolean(config.backendPublicUrl),
      hint: 'Deve ser acessível pela Cielo na internet (HTTPS em produção)',
    },
    {
      id: 'notification_method',
      label: `Formato de notificação: ${config.notificationMethodLabel || 'POST (form-data)'}`,
      required: true,
      done: Boolean(config.notificationMethod),
      hint: config.notificationMethod === 'json'
        ? 'No site Cielo, selecione JSON em Notificação de Pagamentos'
        : 'No site Cielo, selecione POST em Notificação de Pagamentos',
      manual: true,
    },
    {
      id: 'notification',
      label: 'URL de notificação cadastrada no site Cielo',
      required: true,
      done: false,
      hint: `Cadastre no site Cielo: ${config.notificationUrl}`,
      manual: true,
    },
    {
      id: 'status_change',
      label: 'URL de mudança de status cadastrada no site Cielo',
      required: true,
      done: false,
      hint: `Cadastre no site Cielo: ${config.statusChangeUrl}`,
      manual: true,
    },
    {
      id: 'test_mode',
      label: 'Modo Teste ativado no site Cielo (para homologação)',
      required: false,
      done: false,
      hint: 'Checkout Cielo → Configurações → Modo Teste',
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
