import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getSetting, setSetting, maskToken } from '../services/settings.js';
import { DEFAULT_IMAGE_MODEL } from '../services/imageGeneration.js';
import { getCieloConfig, getCieloRequirements } from '../services/cieloConfig.js';
import {
  CHECKOUT_OPTIONS,
  getCheckoutPaymentMethod,
  getCheckoutConfig,
  getPixDiscountPercent,
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
  const enabledPaymentMethods = await getCheckoutPaymentMethod();
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
      checkout_method: enabledPaymentMethods,
      checkout_options: CHECKOUT_OPTIONS,
      checkout_config: {
        available: checkoutConfig.available,
        provider: checkoutConfig.provider,
        isTestMode: checkoutConfig.isTestMode,
        label: checkoutConfig.label,
      },
      pix_key_masked: maskToken(pixKey),
      has_pix_key: Boolean(pixKey || process.env.PIX_KEY),
      pix_holder_name: pixHolderName || process.env.PIX_HOLDER_NAME || '',
      max_installments: cieloConfig.maxInstallments,
      pix_discount_percent: await getPixDiscountPercent(),
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
    cielo: {
      ...cieloConfig,
      merchant_id_masked: maskToken(cieloConfig.merchantId),
      requirements: getCieloRequirements(cieloConfig),
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
      cielo_soft_descriptor,
      cielo_frontend_url,
      cielo_backend_public_url,
      cielo_checkout_api_url,
      cielo_max_installments,
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

    res.json(await buildSettingsResponse('Configurações salvas com sucesso'));
  } catch (err) {
    console.error('Erro ao salvar configurações:', err);
    res.status(500).json({ message: 'Erro ao salvar configurações' });
  }
});

export default router;
