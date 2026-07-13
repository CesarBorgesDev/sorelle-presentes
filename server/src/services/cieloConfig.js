import { getSetting } from './settings.js';

const DEFAULT_CHECKOUT_URL = 'https://cieloecommerce.cielo.com.br/api/public/v1/orders/';

export async function getCieloConfig() {
  const merchantId = ((await getSetting('cielo_merchant_id')) || process.env.CIELO_MERCHANT_ID || '').trim();
  const softDescriptor = ((await getSetting('cielo_soft_descriptor')) || process.env.CIELO_SOFT_DESCRIPTOR || 'SORELLE').trim();
  const frontendUrl = ((await getSetting('cielo_frontend_url')) || process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
  const backendPublicUrl = ((await getSetting('cielo_backend_public_url')) || process.env.APP_PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, '');
  const checkoutApiUrl = ((await getSetting('cielo_checkout_api_url')) || process.env.CIELO_CHECKOUT_URL || DEFAULT_CHECKOUT_URL).trim();
  const maxInstallments = Number((await getSetting('cielo_max_installments')) || process.env.CIELO_MAX_INSTALLMENTS || 12);

  return {
    merchantId,
    softDescriptor: softDescriptor.slice(0, 13),
    frontendUrl,
    backendPublicUrl,
    checkoutApiUrl,
    maxInstallments: Math.min(12, Math.max(1, maxInstallments || 12)),
    returnUrlExample: `${frontendUrl}/pagamento/retorno?pedido=ID_DO_PEDIDO`,
    notificationUrl: `${backendPublicUrl}/api/checkout/cielo/notificacao`,
    statusChangeUrl: `${backendPublicUrl}/api/checkout/cielo/mudanca-status`,
    isReady: Boolean(merchantId),
  };
}

export function getCieloRequirements(config) {
  return [
    {
      id: 'merchant_id',
      label: 'MerchantId configurado (GUID de 36 caracteres)',
      required: true,
      done: Boolean(config.merchantId),
      hint: 'Obtido no painel Checkout Cielo após credenciamento',
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
      id: 'notification',
      label: 'URL de notificação cadastrada no painel Cielo',
      required: true,
      done: false,
      hint: `Cadastre no painel Cielo: ${config.notificationUrl}`,
      manual: true,
    },
    {
      id: 'status_change',
      label: 'URL de mudança de status cadastrada no painel Cielo',
      required: true,
      done: false,
      hint: `Cadastre no painel Cielo: ${config.statusChangeUrl}`,
      manual: true,
    },
    {
      id: 'test_mode',
      label: 'Modo Teste ativado no painel Cielo (para homologação)',
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
