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
  getSyncMinutes,
  listImportedOrders,
  listListings,
  listLogs,
  publishProducts,
  saveListingCategory,
  setSyncMinutes,
  syncConnectedChannels,
  writeLog,
} from '../services/omnichannel/sync.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/', async (_req, res) => {
  try {
    const [channels, listings, orders, logs, syncMinutes, products] = await Promise.all([
      listPublicAccounts(),
      listListings(),
      listImportedOrders(),
      listLogs(),
      getSyncMinutes(),
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
    const channels = await listPublicAccounts();
    res.json(channels.find((channel) => channel.id === req.params.channel));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Não foi possível salvar o canal.' });
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
    const channels = await listPublicAccounts();
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
    const channels = await listPublicAccounts();
    res.json(channels.find((channel) => channel.id === req.params.channel));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Não foi possível desconectar.' });
  }
});

router.put('/listings', async (req, res) => {
  try {
    const { product_id: productId, channel, category_id: categoryId } = req.body || {};
    if (!productId || !channel) {
      return res.status(400).json({ message: 'Informe o produto e o canal.' });
    }
    await saveListingCategory(productId, channel, categoryId);
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
      channels: await listPublicAccounts(),
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Falha na sincronização.' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const syncMinutes = await setSyncMinutes(req.body?.sync_minutes);
    res.json({ sync_minutes: syncMinutes });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Não foi possível salvar o intervalo.' });
  }
});

export default router;
