import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { rowsToEntities } from '../utils/helpers.js';
import { getAdapter } from '../services/omnichannel/adapters/index.js';
import {
  disconnectAccount,
  getAccount,
  listPublicAccounts,
  saveAccount,
} from '../services/omnichannel/accounts.js';
import {
  assertChannels,
  getPriceMarkupPercent,
  getSyncMinutes,
  importMercadoLivreNotification,
  listImportedOrders,
  listListings,
  listLogs,
  publishProducts,
  saveListingCategory,
  setPriceMarkupPercent,
  setSyncMinutes,
  syncConnectedChannels,
  writeLog,
} from '../services/omnichannel/sync.js';
import {
  mercadoLivreCategoryAttributes,
  searchMercadoLivreCategories,
} from '../services/omnichannel/adapters/mercadoLivre.js';
import {
  frontendAdminUrl,
  mercadoLivreAuthUrl,
  mercadoLivreCallbackUrl,
  mercadoLivreNotificationsUrl,
  signMercadoLivreState,
  verifyMercadoLivreState,
} from '../services/omnichannel/mercadoLivreSetup.js';

const router = Router();

function presentChannels(channels) {
  return channels.map((channel) => (
    channel.id === 'mercado_livre'
      ? {
        ...channel,
        oauth_redirect_uri: mercadoLivreCallbackUrl(),
        notifications_url: mercadoLivreNotificationsUrl(),
      }
      : channel
  ));
}

router.get('/mercado-livre/callback', async (req, res) => {
  const redirectError = (message) => {
    const motivo = encodeURIComponent(String(message || 'Falha ao autorizar').slice(0, 180));
    res.redirect(frontendAdminUrl(`?ml=erro&motivo=${motivo}`));
  };
  try {
    verifyMercadoLivreState(req.query.state);
    const code = String(req.query.code || '').trim();
    if (!code) return redirectError('O Mercado Livre não devolveu o code.');
    await saveAccount('mercado_livre', {
      code,
      redirect_uri: mercadoLivreCallbackUrl(),
    }, { status: 'disconnected', lastError: null });
    const account = await getAccount('mercado_livre');
    const result = await getAdapter('mercado_livre').testConnection(account.credentials || {});
    await saveAccount('mercado_livre', result.credentials || {}, {
      status: 'connected',
      shopId: result.shopId || null,
      shopName: result.shopName || null,
      lastError: null,
      markConnected: true,
    });
    await writeLog('mercado_livre', 'connect', true, `${result.shopName || 'Mercado Livre'} conectado.`);
    res.redirect(frontendAdminUrl('?ml=ok'));
  } catch (err) {
    const message = err.message || 'Falha ao autorizar o Mercado Livre.';
    try {
      await saveAccount('mercado_livre', {}, { status: 'error', lastError: message });
      await writeLog('mercado_livre', 'connect', false, message);
    } catch {
      // segue para a tela com o erro
    }
    redirectError(message);
  }
});

router.post('/mercado-livre/notifications', (req, res) => {
  res.sendStatus(200);
  importMercadoLivreNotification(req.body || {}).catch((err) => {
    console.error('[omnichannel] aviso Mercado Livre:', err.message);
  });
});

router.use(requireAuth, requireAdmin);

router.get('/', async (_req, res) => {
  try {
    const [channels, listings, orders, logs, syncMinutes, priceMarkup, products] = await Promise.all([
      listPublicAccounts().then(presentChannels),
      listListings(),
      listImportedOrders(),
      listLogs(),
      getSyncMinutes(),
      getPriceMarkupPercent(),
      pool.query(
        `SELECT id, name, sku, internal_code, quantity, price, image_url
         FROM products
         ORDER BY name ASC`
      ),
    ]);
    res.json({
      channels,
      listings,
      orders: rowsToEntities(orders),
      logs,
      sync_minutes: syncMinutes,
      price_markup_percent: priceMarkup,
      products: rowsToEntities(products.rows),
    });
  } catch (err) {
    console.error('[omnichannel] painel:', err);
    res.status(500).json({ message: 'Não foi possível carregar o Omnichannel.' });
  }
});

router.put('/channels/:channel', async (req, res) => {
  try {
    await saveAccount(req.params.channel, req.body.credentials || {});
    const channels = await listPublicAccounts().then(presentChannels);
    res.json(channels.find((channel) => channel.id === req.params.channel));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Não foi possível salvar o canal.' });
  }
});

router.post('/channels/mercado_livre/authorize', async (req, res) => {
  try {
    const incoming = { ...(req.body?.credentials || {}) };
    if (!String(incoming.redirect_uri || '').trim()) {
      incoming.redirect_uri = mercadoLivreCallbackUrl();
    }
    if (!String(incoming.listing_type_id || '').trim()) incoming.listing_type_id = 'gold_special';
    if (!String(incoming.shipping_mode || '').trim()) incoming.shipping_mode = 'me2';
    await saveAccount('mercado_livre', incoming, { lastError: null });
    const account = await getAccount('mercado_livre');
    const clientId = account?.credentials?.client_id;
    const redirectUri = account?.credentials?.redirect_uri || mercadoLivreCallbackUrl();
    if (!clientId || !account?.credentials?.client_secret) {
      return res.status(400).json({ message: 'Informe o App ID e o Secret antes de autorizar.' });
    }
    const url = mercadoLivreAuthUrl({
      clientId,
      redirectUri,
      state: signMercadoLivreState(),
    });
    res.json({
      url,
      redirect_uri: redirectUri,
      notifications_url: mercadoLivreNotificationsUrl(),
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Não foi possível iniciar a autorização.' });
  }
});

router.get('/mercado-livre/categories', async (req, res) => {
  try {
    res.json(await searchMercadoLivreCategories(req.query.q));
  } catch (err) {
    res.status(400).json({ message: err.message || 'Não foi possível buscar categorias.' });
  }
});

router.get('/mercado-livre/categories/:categoryId/attributes', async (req, res) => {
  try {
    res.json(await mercadoLivreCategoryAttributes(req.params.categoryId));
  } catch (err) {
    res.status(400).json({ message: err.message || 'Não foi possível ler os atributos da categoria.' });
  }
});

router.post('/channels/:channel/connect', async (req, res) => {
  const channel = req.params.channel;
  try {
    await saveAccount(channel, req.body.credentials || {}, { status: 'disconnected', lastError: null });
    const account = await getAccount(channel);
    const result = await getAdapter(channel).testConnection(account.credentials || {});
    await saveAccount(channel, result.credentials || {}, {
      status: 'connected',
      shopId: result.shopId || null,
      shopName: result.shopName || null,
      lastError: null,
      markConnected: true,
    });
    await writeLog(channel, 'connect', true, `${result.shopName || 'Canal'} conectado.`);
    const channels = await listPublicAccounts().then(presentChannels);
    res.json(channels.find((item) => item.id === channel));
  } catch (err) {
    const message = err.message || 'Falha ao conectar.';
    try {
      await saveAccount(channel, {}, { status: 'error', lastError: message });
      await writeLog(channel, 'connect', false, message);
    } catch {
      // canal inválido já respondido abaixo
    }
    res.status(err.status || 400).json({ message });
  }
});

router.post('/channels/:channel/disconnect', async (req, res) => {
  try {
    await disconnectAccount(req.params.channel);
    await writeLog(req.params.channel, 'disconnect', true, 'Canal desconectado.');
    const channels = await listPublicAccounts().then(presentChannels);
    res.json(channels.find((channel) => channel.id === req.params.channel));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Não foi possível desconectar.' });
  }
});

router.put('/listings', async (req, res) => {
  try {
    const body = req.body || {};
    const { product_id: productId, channel, category_id: categoryId, price_override: priceOverride } = body;
    if (!productId || !channel) {
      return res.status(400).json({ message: 'Informe o produto e o canal.' });
    }
    const attributes = Object.prototype.hasOwnProperty.call(body, 'attributes') ? body.attributes : undefined;
    await saveListingCategory(productId, channel, categoryId, priceOverride, attributes);
    res.json({ success: true, listings: await listListings() });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Não foi possível salvar a categoria.' });
  }
});

router.post('/publish', async (req, res) => {
  try {
    const productIds = Array.isArray(req.body?.product_ids) ? req.body.product_ids : [];
    const channels = Array.isArray(req.body?.channels) ? req.body.channels : [];
    if (!productIds.length) {
      return res.status(400).json({ message: 'Selecione ao menos um produto.' });
    }
    assertChannels(channels);
    const results = await publishProducts({ productIds, channels });
    res.json({ results, listings: await listListings(), logs: await listLogs() });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Não foi possível publicar.' });
  }
});

router.post('/sync', async (_req, res) => {
  try {
    const summary = await syncConnectedChannels({ manual: true });
    res.json({
      ...summary,
      orders: rowsToEntities(await listImportedOrders()),
      logs: await listLogs(),
      listings: await listListings(),
      channels: await listPublicAccounts().then(presentChannels),
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Falha na sincronização.' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const syncMinutes = req.body?.sync_minutes != null
      ? await setSyncMinutes(req.body.sync_minutes)
      : await getSyncMinutes();
    const priceMarkup = req.body?.price_markup_percent != null
      ? await setPriceMarkupPercent(req.body.price_markup_percent)
      : await getPriceMarkupPercent();
    res.json({ sync_minutes: syncMinutes, price_markup_percent: priceMarkup });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Não foi possível salvar o intervalo.' });
  }
});

export default router;
