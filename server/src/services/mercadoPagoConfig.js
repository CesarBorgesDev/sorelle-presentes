import { getSetting } from './settings.js';

const API_BASE_URL = 'https://api.mercadopago.com';

export const MERCADO_PAGO_ENVIRONMENTS = {
  test: {
    id: 'test',
    label: 'Teste',
    description: 'Use Access Token de teste (TEST-...). Não cobra de verdade.',
  },
  production: {
    id: 'production',
    label: 'Produção',
    description: 'Use Access Token de produção (APP_USR-...). Cobranças reais.',
  },
};

const DEFAULT_ENVIRONMENT = 'test';

export async function getMercadoPagoConfig() {
  const accessToken = (
    (await getSetting('mercado_pago_access_token'))
    || process.env.MERCADO_PAGO_ACCESS_TOKEN
    || ''
  ).trim();
  const publicKey = (
    (await getSetting('mercado_pago_public_key'))
    || process.env.MERCADO_PAGO_PUBLIC_KEY
    || ''
  ).trim();
  const webhookSecret = (
    (await getSetting('mercado_pago_webhook_secret'))
    || process.env.MERCADO_PAGO_WEBHOOK_SECRET
    || ''
  ).trim();
  const rawEnvironment = (
    (await getSetting('mercado_pago_environment'))
    || process.env.MERCADO_PAGO_ENVIRONMENT
    || DEFAULT_ENVIRONMENT
  ).trim().toLowerCase();
  const environment = MERCADO_PAGO_ENVIRONMENTS[rawEnvironment]
    ? rawEnvironment
    : DEFAULT_ENVIRONMENT;
  const envDefaults = MERCADO_PAGO_ENVIRONMENTS[environment];

  const frontendUrl = (
    (await getSetting('mercado_pago_frontend_url'))
    || process.env.FRONTEND_URL
    || process.env.CORS_ORIGIN
    || 'http://localhost:3000'
  ).replace(/\/$/, '');
  const backendPublicUrl = (
    (await getSetting('mercado_pago_backend_public_url'))
    || process.env.APP_PUBLIC_URL
    || 'http://localhost:3001'
  ).replace(/\/$/, '');

  const hasCredentials = Boolean(accessToken);

  return {
    accessToken,
    publicKey,
    webhookSecret,
    environment,
    environmentLabel: envDefaults.label,
    environmentDescription: envDefaults.description,
    environments: Object.values(MERCADO_PAGO_ENVIRONMENTS),
    frontendUrl,
    backendPublicUrl,
    apiBaseUrl: API_BASE_URL,
    returnUrlExample: `${frontendUrl}/pagamento/retorno?pedido=ID_DO_PEDIDO`,
    webhookUrl: `${backendPublicUrl}/api/checkout/mercado-pago/webhook`,
    isReady: hasCredentials,
    hasCredentials,
  };
}

export function getMercadoPagoRequirements(config) {
  return [
    {
      id: 'access_token',
      label: 'Access Token configurado',
      required: true,
      done: Boolean(config.accessToken),
      hint: 'Suas integrações → Credenciais no painel Mercado Pago (TEST-... ou APP_USR-...)',
    },
    {
      id: 'public_key',
      label: 'Public Key configurada (opcional no Checkout Pro)',
      required: false,
      done: Boolean(config.publicKey),
      hint: 'Útil se no futuro usar Bricks; não é obrigatória para redirect',
    },
    {
      id: 'frontend_url',
      label: 'URL do site (retorno após pagamento)',
      required: true,
      done: Boolean(config.frontendUrl),
      hint: 'Ex.: https://sorellepresentes.com.br ou http://localhost:3000',
    },
    {
      id: 'backend_url',
      label: 'URL pública do backend (webhooks)',
      required: true,
      done: Boolean(config.backendPublicUrl),
      hint: 'Deve ser acessível pelo Mercado Pago na internet (HTTPS em produção)',
    },
    {
      id: 'webhook',
      label: 'URL de webhook cadastrada no Mercado Pago',
      required: true,
      done: false,
      hint: `Cadastre no painel MP: ${config.webhookUrl}`,
      manual: true,
    },
    {
      id: 'webhook_secret',
      label: 'Secret de assinatura do webhook (recomendado)',
      required: false,
      done: Boolean(config.webhookSecret),
      hint: 'Em Webhooks → Configurar notificações → chave secreta (x-signature)',
    },
    {
      id: 'environment',
      label: `Ambiente: ${config.environmentLabel || 'Teste'}`,
      required: true,
      done: Boolean(config.environment),
      hint: config.environment === 'production'
        ? 'Use credenciais de produção (APP_USR-...)'
        : 'Use credenciais de teste (TEST-...)',
      manual: true,
    },
  ];
}
