import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getSetting, setSetting, maskToken } from '../services/settings.js';
import { DEFAULT_IMAGE_MODEL } from '../services/imageGeneration.js';
import { getCieloConfig, getCieloRequirements } from '../services/cieloConfig.js';
import { CHECKOUT_OPTIONS, getCheckoutPaymentMethod, getCheckoutConfig } from '../services/paymentMethods.js';
import { getCorreiosConfig } from '../services/correios.js';

const router = Router();

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
    },
    correios: {
      origin_zip: correiosConfig.originZip,
      has_contract: correiosConfig.hasContract,
      services: correiosConfig.services,
      fallback_mode: correiosConfig.fallbackMode,
      carrier: correiosConfig.carrier,
    },
    cielo: {
      ...cieloConfig,
      merchant_id_masked: maskToken(cieloConfig.merchantId),
      requirements: getCieloRequirements(cieloConfig),
    },
  };
}

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
      correios_origin_zip,
      correios_company_code,
      correios_password,
      shipping_carrier_enabled,
      shipping_carrier_name,
      shipping_carrier_price,
      shipping_carrier_deadline_days,
      image_model,
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

    if (correios_origin_zip !== undefined) {
      await setSetting('correios_origin_zip', correios_origin_zip.replace(/\D/g, '').slice(0, 8));
    }

    if (correios_company_code !== undefined && correios_company_code !== '') {
      await setSetting('correios_company_code', correios_company_code.trim());
    }

    if (correios_password !== undefined && correios_password !== '') {
      await setSetting('correios_password', correios_password.trim());
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

    if (image_model !== undefined && image_model !== '') {
      await setSetting('image_model', image_model.trim());
    }

    res.json(await buildSettingsResponse('Configurações salvas com sucesso'));
  } catch (err) {
    console.error('Erro ao salvar configurações:', err);
    res.status(500).json({ message: 'Erro ao salvar configurações' });
  }
});

export default router;
