import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getSetting, setSetting, maskToken } from '../services/settings.js';
import { DEFAULT_IMAGE_MODEL } from '../services/imageGeneration.js';
import { getCieloConfig, getCieloRequirements } from '../services/cieloConfig.js';
import { getSipagConfig, getSipagRequirements, PAYMENT_GATEWAYS } from '../services/sipagConfig.js';
import { getMercadoPagoConfig, getMercadoPagoRequirements } from '../services/mercadoPagoConfig.js';
import { getStorePickupConfig } from '../services/storePickup.js';
import {
  CHECKOUT_OPTIONS,
  getCheckoutPaymentMethod,
  getCheckoutConfig,
  getPixDiscountPercent,
  getEnabledPaymentMethodIds,
  getPaymentGateway,
} from '../services/paymentMethods.js';
import { getCorreiosConfig } from '../services/correios.js';
import { getRodonavesConfig } from '../services/rodonaves.js';

const router = Router();

const PRODUCT_SORT_OPTIONS = ['name', 'code', 'price'];

async function getProductSortOrder() {
  const value = await getSetting('product_sort_order');
  return PRODUCT_SORT_OPTIONS.includes(value) ? value : 'name';
}

async function buildSettingsResponse(message) {
  const pollinationsKey = await getSetting('pollinations_api_key');
  const hfToken = await getSetting('huggingface_api_token');
  const stableHordeKey = await getSetting('stable_horde_api_key');
  const cieloConfig = await getCieloConfig();
  const sipagConfig = await getSipagConfig();
  const mercadoPagoConfig = await getMercadoPagoConfig();
  const paymentGateway = await getPaymentGateway();
  const enabledPaymentMethods = await getEnabledPaymentMethodIds();
  const checkoutConfig = await getCheckoutConfig();
  const pixKey = await getSetting('pix_key');
  const pixHolderName = await getSetting('pix_holder_name');
  const correiosConfig = await getCorreiosConfig();
  const rodonavesConfig = await getRodonavesConfig();

  return {
    ...(message ? { message } : {}),
    image_provider: 'stable_horde',
    pollinations_api_key_masked: maskToken(pollinationsKey),
    has_pollinations_key: Boolean(pollinationsKey),
    huggingface_api_token_masked: maskToken(hfToken),
    has_huggingface_token: Boolean(hfToken),
    stable_horde_api_key_masked: maskToken(stableHordeKey),
    has_stable_horde_key: Boolean(stableHordeKey),
    image_model: (await getSetting('image_model')) || DEFAULT_IMAGE_MODEL,
    product_sort_order: await getProductSortOrder(),
    payment: {
      checkout_method: await getCheckoutPaymentMethod(),
      payment_methods_enabled: enabledPaymentMethods,
      checkout_options: CHECKOUT_OPTIONS,
      checkout_config: {
        available: checkoutConfig.available,
        provider: checkoutConfig.provider,
        payment_gateway: paymentGateway,
        isTestMode: checkoutConfig.isTestMode,
        label: checkoutConfig.label,
      },
      pix_key_masked: maskToken(pixKey),
      has_pix_key: Boolean(pixKey || process.env.PIX_KEY),
      pix_holder_name: pixHolderName || process.env.PIX_HOLDER_NAME || '',
      max_installments: cieloConfig.maxInstallments,
      pix_discount_percent: await getPixDiscountPercent(),
      payment_gateway: paymentGateway,
      payment_gateways: Object.values(PAYMENT_GATEWAYS),
    },
    correios: {
      origin_zip: correiosConfig.originZip,
      has_contract: correiosConfig.hasContract,
      services: correiosConfig.services,
      fallback_mode: correiosConfig.fallbackMode,
      carrier: correiosConfig.carrier,
      sender_name: (await getSetting('correios_sender_name')) || '',
      sender_street: (await getSetting('correios_sender_street')) || '',
      sender_city: (await getSetting('correios_sender_city')) || '',
      sender_state: (await getSetting('correios_sender_state')) || '',
      sender_phone: (await getSetting('correios_sender_phone')) || '',
      has_api_credentials: Boolean(
        (await getSetting('correios_api_user')) || process.env.CORREIOS_API_USER
      ),
      has_post_card: Boolean(
        (await getSetting('correios_post_card')) || process.env.CORREIOS_POST_CARD
      ),
      post_card_masked: maskToken((await getSetting('correios_post_card')) || process.env.CORREIOS_POST_CARD || ''),
      contract_number: (
        (await getSetting('correios_contract_number'))
        || (await getSetting('correios_company_code'))
        || process.env.CORREIOS_CONTRACT_NUMBER
        || process.env.CORREIOS_COMPANY_CODE
        || ''
      ),
      sender_number: (await getSetting('correios_sender_number')) || '',
      sender_district: (await getSetting('correios_sender_district')) || '',
      sender_complement: (await getSetting('correios_sender_complement')) || '',
      sender_cnpj: (await getSetting('correios_sender_cnpj')) || '',
    },
    rodonaves: {
      enabled: rodonavesConfig.enabled,
      is_ready: rodonavesConfig.isReady,
      label: rodonavesConfig.label,
      username: rodonavesConfig.username,
      has_password: Boolean(rodonavesConfig.password),
      password_masked: maskToken(rodonavesConfig.password),
      cnpj: rodonavesConfig.cnpj,
    },
    store_pickup: await getStorePickupConfig(),
    cielo: {
      ...cieloConfig,
      clientId: undefined,
      clientSecret: undefined,
      has_merchant_id: Boolean(cieloConfig.merchantId),
      has_client_id: Boolean(cieloConfig.clientId),
      has_client_secret: Boolean(cieloConfig.clientSecret),
      merchant_id_masked: maskToken(cieloConfig.merchantId),
      client_id_masked: maskToken(cieloConfig.clientId),
      client_secret_masked: maskToken(cieloConfig.clientSecret),
      requirements: getCieloRequirements(cieloConfig),
    },
    sipag: {
      ...sipagConfig,
      userPassword: undefined,
      certPassword: undefined,
      certPem: undefined,
      certKey: undefined,
      has_store_id: Boolean(sipagConfig.storeId),
      has_user_id: Boolean(sipagConfig.userId),
      has_user_password: Boolean(sipagConfig.userPassword),
      has_cert_password: Boolean(sipagConfig.certPassword),
      has_cert_pem: Boolean(sipagConfig.certPem),
      has_cert_key: Boolean(sipagConfig.certKey),
      store_id_masked: maskToken(sipagConfig.storeId),
      user_id_masked: maskToken(sipagConfig.userId),
      requirements: getSipagRequirements(sipagConfig),
    },
    mercado_pago: {
      ...mercadoPagoConfig,
      accessToken: undefined,
      webhookSecret: undefined,
      has_access_token: Boolean(mercadoPagoConfig.accessToken),
      has_public_key: Boolean(mercadoPagoConfig.publicKey),
      has_webhook_secret: Boolean(mercadoPagoConfig.webhookSecret),
      access_token_masked: maskToken(mercadoPagoConfig.accessToken),
      public_key_masked: maskToken(mercadoPagoConfig.publicKey),
      requirements: getMercadoPagoRequirements(mercadoPagoConfig),
    },
  };
}

// Preferências públicas usadas pela loja (sem autenticação)
router.get('/public', async (_req, res) => {
  try {
    res.json({ product_sort_order: await getProductSortOrder() });
  } catch (err) {
    console.error('Erro ao buscar configurações públicas:', err);
    res.status(500).json({ message: 'Erro ao carregar configurações' });
  }
});

router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  try {
    res.json(await buildSettingsResponse());
  } catch (err) {
    console.error('Erro ao buscar configurações:', err);
    res.status(500).json({ message: 'Erro ao carregar configurações' });
  }
});

router.put('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      pollinations_api_key,
      huggingface_api_token,
      stable_horde_api_key,
      cielo_merchant_id,
      cielo_client_id,
      cielo_client_secret,
      cielo_soft_descriptor,
      cielo_frontend_url,
      cielo_backend_public_url,
      cielo_checkout_api_url,
      cielo_max_installments,
      cielo_notification_method,
      cielo_environment,
      payment_gateway,
      sipag_store_id,
      sipag_user_id,
      sipag_user_password,
      sipag_cert_password,
      sipag_cert_pem,
      sipag_cert_key,
      sipag_soft_descriptor,
      sipag_environment,
      sipag_frontend_url,
      sipag_api_url,
      mercado_pago_access_token,
      mercado_pago_public_key,
      mercado_pago_webhook_secret,
      mercado_pago_environment,
      mercado_pago_frontend_url,
      mercado_pago_backend_public_url,
      payment_methods_enabled,
      checkout_payment_method,
      pix_key,
      pix_holder_name,
      pix_discount_percent,
      correios_origin_zip,
      correios_company_code,
      correios_password,
      correios_api_user,
      correios_api_password,
      correios_post_card,
      correios_contract_number,
      correios_contract_dr,
      correios_sender_name,
      correios_sender_street,
      correios_sender_number,
      correios_sender_complement,
      correios_sender_district,
      correios_sender_city,
      correios_sender_state,
      correios_sender_phone,
      correios_sender_cnpj,
      shipping_carrier_enabled,
      shipping_carrier_name,
      shipping_carrier_price,
      shipping_carrier_deadline_days,
      rodonaves_enabled,
      rodonaves_username,
      rodonaves_password,
      rodonaves_cnpj,
      rodonaves_label,
      image_model,
      product_sort_order,
      store_pickup_enabled,
      store_pickup_label,
      store_pickup_address,
      store_pickup_instructions,
      store_pickup_deadline_days,
    } = req.body;

    if (pollinations_api_key !== undefined && pollinations_api_key !== '') {
      await setSetting('pollinations_api_key', pollinations_api_key.trim());
    }

    if (huggingface_api_token !== undefined && huggingface_api_token !== '') {
      await setSetting('huggingface_api_token', huggingface_api_token.trim());
    }

    if (stable_horde_api_key !== undefined && stable_horde_api_key !== '') {
      await setSetting('stable_horde_api_key', stable_horde_api_key.trim());
    }

    if (cielo_merchant_id !== undefined && cielo_merchant_id !== '') {
      await setSetting('cielo_merchant_id', cielo_merchant_id.trim());
    }

    if (cielo_client_id !== undefined && cielo_client_id !== '') {
      await setSetting('cielo_client_id', cielo_client_id.trim());
    }

    if (cielo_client_secret !== undefined && cielo_client_secret !== '') {
      await setSetting('cielo_client_secret', cielo_client_secret.trim());
    }

    if (cielo_soft_descriptor !== undefined) {
      await setSetting('cielo_soft_descriptor', cielo_soft_descriptor.trim());
    }

    if (cielo_frontend_url !== undefined) {
      await setSetting('cielo_frontend_url', cielo_frontend_url.trim());
    }

    if (cielo_backend_public_url !== undefined) {
      await setSetting('cielo_backend_public_url', cielo_backend_public_url.trim());
    }

    if (cielo_checkout_api_url !== undefined && cielo_checkout_api_url !== '') {
      await setSetting('cielo_checkout_api_url', cielo_checkout_api_url.trim());
    }

    if (cielo_max_installments !== undefined && cielo_max_installments !== '') {
      await setSetting('cielo_max_installments', String(cielo_max_installments));
    }

    if (cielo_notification_method !== undefined && cielo_notification_method !== '') {
      const method = String(cielo_notification_method).trim().toLowerCase();
      if (method === 'post' || method === 'json') {
        await setSetting('cielo_notification_method', method);
      }
    }

    if (cielo_environment !== undefined && cielo_environment !== '') {
      const env = String(cielo_environment).trim().toLowerCase();
      if (env === 'production' || env === 'homologacao') {
        await setSetting('cielo_environment', env);
      }
    }

    if (payment_gateway !== undefined && payment_gateway !== '') {
      const gateway = String(payment_gateway).trim().toLowerCase();
      if (PAYMENT_GATEWAYS[gateway]) {
        await setSetting('payment_gateway', gateway);
      }
    }

    if (sipag_store_id !== undefined && sipag_store_id !== '') {
      await setSetting('sipag_store_id', sipag_store_id.trim());
    }

    if (sipag_user_id !== undefined && sipag_user_id !== '') {
      await setSetting('sipag_user_id', sipag_user_id.trim());
    }

    if (sipag_user_password !== undefined && sipag_user_password !== '') {
      await setSetting('sipag_user_password', sipag_user_password.trim());
    }

    if (sipag_cert_password !== undefined && sipag_cert_password !== '') {
      await setSetting('sipag_cert_password', sipag_cert_password.trim());
    }

    if (sipag_cert_pem !== undefined && sipag_cert_pem !== '') {
      await setSetting('sipag_cert_pem', sipag_cert_pem.trim());
    }

    if (sipag_cert_key !== undefined && sipag_cert_key !== '') {
      await setSetting('sipag_cert_key', sipag_cert_key.trim());
    }

    if (sipag_soft_descriptor !== undefined) {
      await setSetting('sipag_soft_descriptor', sipag_soft_descriptor.trim());
    }

    if (sipag_environment !== undefined && sipag_environment !== '') {
      const env = String(sipag_environment).trim().toLowerCase();
      if (env === 'test' || env === 'production') {
        await setSetting('sipag_environment', env);
      }
    }

    if (sipag_frontend_url !== undefined) {
      await setSetting('sipag_frontend_url', sipag_frontend_url.trim());
    }

    if (sipag_api_url !== undefined && sipag_api_url !== '') {
      await setSetting('sipag_api_url', sipag_api_url.trim());
    }

    if (mercado_pago_access_token !== undefined && mercado_pago_access_token !== '') {
      await setSetting('mercado_pago_access_token', mercado_pago_access_token.trim());
    }

    if (mercado_pago_public_key !== undefined && mercado_pago_public_key !== '') {
      await setSetting('mercado_pago_public_key', mercado_pago_public_key.trim());
    }

    if (mercado_pago_webhook_secret !== undefined && mercado_pago_webhook_secret !== '') {
      await setSetting('mercado_pago_webhook_secret', mercado_pago_webhook_secret.trim());
    }

    if (mercado_pago_environment !== undefined && mercado_pago_environment !== '') {
      const env = String(mercado_pago_environment).trim().toLowerCase();
      if (env === 'test' || env === 'production') {
        await setSetting('mercado_pago_environment', env);
      }
    }

    if (mercado_pago_frontend_url !== undefined) {
      await setSetting('mercado_pago_frontend_url', mercado_pago_frontend_url.trim());
    }

    if (mercado_pago_backend_public_url !== undefined) {
      await setSetting('mercado_pago_backend_public_url', mercado_pago_backend_public_url.trim());
    }

    if (checkout_payment_method !== undefined && checkout_payment_method !== '') {
      await setSetting('checkout_payment_method', checkout_payment_method.trim());
    }

    if (payment_methods_enabled !== undefined) {
      const methods = Array.isArray(payment_methods_enabled)
        ? payment_methods_enabled
        : String(payment_methods_enabled).split(',').map((s) => s.trim()).filter(Boolean);
      await setSetting('payment_methods_enabled', JSON.stringify(methods));
    }

    if (pix_key !== undefined && pix_key !== '') {
      await setSetting('pix_key', pix_key.trim());
    }

    if (pix_holder_name !== undefined) {
      await setSetting('pix_holder_name', pix_holder_name.trim());
    }

    if (pix_discount_percent !== undefined && pix_discount_percent !== '') {
      const discount = Math.min(100, Math.max(0, Number(pix_discount_percent) || 0));
      await setSetting('pix_discount_percent', String(discount));
    }

    if (correios_origin_zip !== undefined) {
      await setSetting('correios_origin_zip', correios_origin_zip.replace(/\D/g, '').slice(0, 8));
    }

    if (correios_company_code !== undefined && correios_company_code !== '') {
      await setSetting('correios_company_code', correios_company_code.trim());
    }

    if (correios_password !== undefined && correios_password !== '') {
      await setSetting('correios_password', correios_password.trim());
    }

    if (correios_api_user !== undefined) {
      await setSetting('correios_api_user', correios_api_user.trim());
    }

    if (correios_api_password !== undefined && correios_api_password !== '') {
      await setSetting('correios_api_password', correios_api_password.trim());
    }

    if (correios_post_card !== undefined && correios_post_card !== '') {
      await setSetting('correios_post_card', correios_post_card.replace(/\D/g, '').trim());
    }

    if (correios_contract_number !== undefined && correios_contract_number !== '') {
      await setSetting('correios_contract_number', correios_contract_number.trim());
    }

    if (correios_contract_dr !== undefined && correios_contract_dr !== '') {
      await setSetting('correios_contract_dr', String(correios_contract_dr).trim());
    }

    if (correios_sender_name !== undefined) {
      await setSetting('correios_sender_name', correios_sender_name.trim());
    }

    if (correios_sender_street !== undefined) {
      await setSetting('correios_sender_street', correios_sender_street.trim());
    }

    if (correios_sender_number !== undefined) {
      await setSetting('correios_sender_number', correios_sender_number.trim());
    }

    if (correios_sender_complement !== undefined) {
      await setSetting('correios_sender_complement', correios_sender_complement.trim());
    }

    if (correios_sender_district !== undefined) {
      await setSetting('correios_sender_district', correios_sender_district.trim());
    }

    if (correios_sender_city !== undefined) {
      await setSetting('correios_sender_city', correios_sender_city.trim());
    }

    if (correios_sender_state !== undefined) {
      await setSetting('correios_sender_state', correios_sender_state.trim().toUpperCase().slice(0, 2));
    }

    if (correios_sender_phone !== undefined) {
      await setSetting('correios_sender_phone', correios_sender_phone.trim());
    }

    if (correios_sender_cnpj !== undefined) {
      await setSetting('correios_sender_cnpj', correios_sender_cnpj.replace(/\D/g, '').trim());
    }

    if (shipping_carrier_enabled !== undefined) {
      await setSetting('shipping_carrier_enabled', shipping_carrier_enabled ? 'true' : 'false');
    }

    if (shipping_carrier_name !== undefined) {
      await setSetting('shipping_carrier_name', String(shipping_carrier_name).trim());
    }

    if (shipping_carrier_price !== undefined && shipping_carrier_price !== '') {
      await setSetting('shipping_carrier_price', String(shipping_carrier_price).replace(',', '.'));
    }

    if (shipping_carrier_deadline_days !== undefined && shipping_carrier_deadline_days !== '') {
      await setSetting('shipping_carrier_deadline_days', String(shipping_carrier_deadline_days));
    }

    if (rodonaves_enabled !== undefined) {
      await setSetting('rodonaves_enabled', rodonaves_enabled ? 'true' : 'false');
    }

    if (rodonaves_username !== undefined) {
      await setSetting('rodonaves_username', rodonaves_username.trim());
    }

    if (rodonaves_password !== undefined && rodonaves_password !== '') {
      await setSetting('rodonaves_password', rodonaves_password.trim());
    }

    if (rodonaves_cnpj !== undefined) {
      await setSetting('rodonaves_cnpj', rodonaves_cnpj.replace(/\D/g, '').slice(0, 14));
    }

    if (rodonaves_label !== undefined) {
      await setSetting('rodonaves_label', String(rodonaves_label).trim());
    }

    if (image_model !== undefined && image_model !== '') {
      await setSetting('image_model', image_model.trim());
    }

    if (product_sort_order !== undefined && PRODUCT_SORT_OPTIONS.includes(product_sort_order)) {
      await setSetting('product_sort_order', product_sort_order);
    }

    if (store_pickup_enabled !== undefined) {
      await setSetting('store_pickup_enabled', store_pickup_enabled ? 'true' : 'false');
    }
    if (store_pickup_label !== undefined) {
      await setSetting('store_pickup_label', String(store_pickup_label).trim());
    }
    if (store_pickup_address !== undefined) {
      await setSetting('store_pickup_address', String(store_pickup_address).trim());
    }
    if (store_pickup_instructions !== undefined) {
      await setSetting('store_pickup_instructions', String(store_pickup_instructions).trim());
    }
    if (store_pickup_deadline_days !== undefined && store_pickup_deadline_days !== '') {
      await setSetting('store_pickup_deadline_days', String(store_pickup_deadline_days));
    }

    res.json(await buildSettingsResponse('Configurações salvas com sucesso'));
  } catch (err) {
    console.error('Erro ao salvar configurações:', err);
    res.status(500).json({ message: 'Erro ao salvar configurações' });
  }
});

export default router;
