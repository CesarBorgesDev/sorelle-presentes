import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { config } from '../config/env.js';
import {
  getMelhorEnvioConfig,
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  clearMelhorEnvioTokens,
  quoteMelhorEnvioShipping,
} from '../services/melhorEnvio.js';
import { getCorreiosConfig, buildPackageFromProducts } from '../services/correios.js';

const router = Router();

function adminSettingsRedirect(query) {
  const base = (config.frontendUrl || '').replace(/\/$/, '') || 'http://localhost:5173';
  const params = new URLSearchParams({
    tab: 'frete',
    sub: 'melhor_envio',
    ...query,
  });
  return `${base}/admin/configuracoes?${params.toString()}`;
}

/** URL OAuth para o admin abrir no navegador */
router.get('/authorize-url', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const cfg = await getMelhorEnvioConfig();
    if (!cfg.hasApp) {
      return res.status(400).json({
        message: 'Configure Client ID, Client Secret e Redirect URI antes de conectar.',
      });
    }
    const url = await buildAuthorizeUrl(cfg);
    res.json({ url, redirect_uri: cfg.redirectUri, environment: cfg.environment });
  } catch (err) {
    console.error('[Melhor Envio] authorize-url:', err);
    res.status(400).json({ message: err.message || 'Erro ao montar URL de autorização' });
  }
});

/**
 * Callback OAuth (público — redirect do Melhor Envio).
 * Troca code → tokens e redireciona ao admin.
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, error, error_description: errorDescription } = req.query;
    if (error) {
      return res.redirect(adminSettingsRedirect({
        melhor_envio: 'error',
        message: String(errorDescription || error).slice(0, 200),
      }));
    }
    if (!code) {
      return res.redirect(adminSettingsRedirect({
        melhor_envio: 'error',
        message: 'Código de autorização ausente',
      }));
    }

    await exchangeAuthorizationCode(String(code));
    return res.redirect(adminSettingsRedirect({ melhor_envio: 'connected' }));
  } catch (err) {
    console.error('[Melhor Envio] callback:', err);
    return res.redirect(adminSettingsRedirect({
      melhor_envio: 'error',
      message: String(err.message || 'Falha ao conectar').slice(0, 200),
    }));
  }
});

router.post('/disconnect', requireAuth, requireAdmin, async (_req, res) => {
  try {
    await clearMelhorEnvioTokens();
    res.json({ message: 'Melhor Envio desconectado', connected: false });
  } catch (err) {
    console.error('[Melhor Envio] disconnect:', err);
    res.status(500).json({ message: err.message || 'Erro ao desconectar' });
  }
});

/** Cotação de teste (CEP destino) */
router.post('/test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const destinationZip = String(req.body?.destination_zip || req.body?.cep || '').replace(/\D/g, '');
    if (destinationZip.length !== 8) {
      return res.status(400).json({ message: 'Informe um CEP de destino válido (8 dígitos)' });
    }

    const cfg = await getMelhorEnvioConfig();
    if (!cfg.enabled) {
      return res.status(400).json({ message: 'Melhor Envio está desabilitado. Habilite e salve.' });
    }
    if (!cfg.connected) {
      return res.status(400).json({ message: 'Conecte o Melhor Envio (OAuth) antes de testar.' });
    }

    const correios = await getCorreiosConfig();
    const packageInfo = buildPackageFromProducts([{
      quantity: 1,
      weight_kg: 0.5,
      length_cm: 20,
      width_cm: 15,
      height_cm: 10,
    }], correios);

    const options = await quoteMelhorEnvioShipping({
      destinationZip,
      packageInfo,
      invoiceValue: Number(req.body?.invoice_value) || 100,
      config: { ...cfg, isReady: true },
    });

    res.json({
      message: options.length
        ? `${options.length} opção(ões) encontrada(s)`
        : 'Nenhuma opção disponível para este CEP',
      destination_zip: destinationZip,
      options: options.slice(0, 15),
    });
  } catch (err) {
    console.error('[Melhor Envio] test:', err);
    res.status(400).json({ message: err.message || 'Erro na cotação de teste' });
  }
});

export default router;
