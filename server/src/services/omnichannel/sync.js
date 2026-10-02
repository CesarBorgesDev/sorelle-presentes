import pool from '../../config/db.js';
import { getSetting, setSetting } from '../settings.js';
import { consumeStockForOrder } from '../../utils/stockInventory.js';
import { CHANNEL_IDS, getChannel } from './constants.js';
import { getAdapter } from './adapters/index.js';
import { buildListingUnits, parsePriceOverride, resolveChannelPrice } from './catalog.js';
import { getAccount, replaceCredentials } from './accounts.js';

let timer = null;
let running = false;

function plainText(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const parts = [
      value.full_address, value.street, value.street_name, value.number, value.street_number,
      value.neighborhood, value.district, value.city?.name || value.city, value.state?.name || value.state,
      value.zip_code, value.zipcode,
    ].filter((part) => typeof part === 'string' && part.trim());
    return parts.join(', ') || null;
  }
  return String(value);
}

export async function writeLog(channel, action, success, message) {
  await pool.query(
    `INSERT INTO channel_sync_logs (channel, action, success, message)
     VALUES ($1, $2, $3, $4)`,
    [channel || null, action, Boolean(success), String(message || '').slice(0, 1000)]
  );
  await pool.query(
    `DELETE FROM channel_sync_logs
     WHERE id IN (
       SELECT id FROM channel_sync_logs ORDER BY created_date DESC OFFSET 400
     )`
  );
}

async function rememberCredentials(channel, credentials, extra = {}) {
  if (!credentials) return;
  await replaceCredentials(channel, credentials, extra);
}

async function loadProduct(productId) {
  const result = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
  return result.rows[0] || null;
}

export async function saveListingCategory(productId, channel, categoryId, priceOverride) {
  if (!getChannel(channel)) throw Object.assign(new Error('Canal desconhecido.'), { status: 400 });
  const product = await loadProduct(productId);
  if (!product) throw Object.assign(new Error('Produto não encontrado.'), { status: 404 });
  const units = buildListingUnits(product).filter((unit) => !unit.skip);
  if (!units.length) {
    throw Object.assign(new Error('Nenhuma combinação com SKU para este produto.'), { status: 400 });
  }
  const override = parsePriceOverride(priceOverride);
  for (const unit of units) {
    await pool.query(
      `INSERT INTO channel_listings (product_id, channel, variant_key, category_id, external_sku, price_override, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       ON CONFLICT (product_id, channel, variant_key)
       DO UPDATE SET category_id = EXCLUDED.category_id, price_override = EXCLUDED.price_override, updated_date = NOW()`,
      [productId, channel, unit.variantKey, String(categoryId || '').trim() || null, unit.sku, override]
    );
  }
}

async function upsertListing(productId, channel, unit, patch) {
  const result = await pool.query(
    `INSERT INTO channel_listings (
       product_id, channel, variant_key, external_id, external_sku, external_variant_id,
       category_id, status, last_error, last_sync_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW())
     ON CONFLICT (product_id, channel, variant_key)
     DO UPDATE SET
       external_id = COALESCE(EXCLUDED.external_id, channel_listings.external_id),
       external_sku = COALESCE(EXCLUDED.external_sku, channel_listings.external_sku),
       external_variant_id = COALESCE(EXCLUDED.external_variant_id, channel_listings.external_variant_id),
       category_id = COALESCE(EXCLUDED.category_id, channel_listings.category_id),
       status = EXCLUDED.status,
       last_error = EXCLUDED.last_error,
       last_sync_at = NOW(),
       updated_date = NOW()
     RETURNING *`,
    [
      productId,
      channel,
      unit.variantKey,
      patch.externalId || null,
      unit.sku,
      patch.externalVariantId || null,
      patch.categoryId || null,
      patch.status,
      patch.lastError || null,
    ]
  );
  return result.rows[0];
}

export async function publishProducts({ productIds, channels }) {
  const markup = await getPriceMarkupPercent();
  const results = [];
  for (const channel of channels) {
    if (!getChannel(channel)) continue;
    const account = await getAccount(channel);
    if (!account || account.status !== 'connected') {
      const message = `${getChannel(channel).label} está desconectado. Conecte o canal antes de publicar.`;
      await writeLog(channel, 'publish', false, message);
      results.push({ channel, success: false, message });
      continue;
    }
    const adapter = getAdapter(channel);
    let credentials = account.credentials || {};
    for (const productId of productIds) {
      const product = await loadProduct(productId);
      if (!product) {
        results.push({ channel, productId, success: false, message: 'Produto não encontrado.' });
        continue;
      }
      const units = buildListingUnits(product);
      for (const unit of units) {
        if (unit.skip) {
          await writeLog(channel, 'publish', false, `${product.name}: ${unit.reason}`);
          results.push({ channel, productId, success: false, message: unit.reason });
          continue;
        }
        const existing = await pool.query(
          `SELECT * FROM channel_listings WHERE product_id = $1 AND channel = $2 AND variant_key = $3`,
          [productId, channel, unit.variantKey]
        );
        const listing = existing.rows[0];
        const categoryId = listing?.category_id || '';
        if (!categoryId) {
          const message = `${product.name}: informe a categoria do canal antes de publicar.`;
          await upsertListing(productId, channel, unit, { status: 'error', lastError: message, categoryId });
          await writeLog(channel, 'publish', false, message);
          results.push({ channel, productId, success: false, message });
          continue;
        }
        try {
          const published = await adapter.publishListing({
            credentials,
            unit: {
              ...unit,
              price: resolveChannelPrice(unit.price, markup, listing?.price_override),
              externalVariantId: listing?.external_variant_id || null,
            },
            categoryId,
            externalId: listing?.external_id || null,
          });
          credentials = published.credentials || credentials;
          await rememberCredentials(channel, credentials);
          await upsertListing(productId, channel, unit, {
            externalId: published.externalId,
            externalVariantId: published.externalVariantId,
            categoryId,
            status: 'published',
            lastError: null,
          });
          const message = `${product.name} publicado em ${getChannel(channel).label} (${unit.sku}).`;
          await writeLog(channel, 'publish', true, message);
          results.push({ channel, productId, success: true, message });
        } catch (err) {
          const message = `${product.name}: ${err.message}`;
          await upsertListing(productId, channel, unit, {
            externalId: listing?.external_id || err.externalId || null,
            categoryId,
            status: 'error',
            lastError: err.message,
          });
          await writeLog(channel, 'publish', false, message);
          results.push({ channel, productId, success: false, message });
        }
      }
    }
  }
  return results;
}

async function matchListing(channel, item) {
  if (item.externalItemId) {
    const byExternal = await pool.query(
      `SELECT * FROM channel_listings WHERE channel = $1 AND external_id = $2 LIMIT 1`,
      [channel, String(item.externalItemId)]
    );
    if (byExternal.rows[0]) return byExternal.rows[0];
  }
  if (item.sku) {
    const bySku = await pool.query(
      `SELECT * FROM channel_listings WHERE channel = $1 AND external_sku = $2 LIMIT 1`,
      [channel, String(item.sku)]
    );
    if (bySku.rows[0]) return bySku.rows[0];
    const byProduct = await pool.query(
      `SELECT id AS product_id FROM products
       WHERE sku = $1 OR internal_code = $1
       LIMIT 1`,
      [String(item.sku)]
    );
    if (byProduct.rows[0]) return byProduct.rows[0];
  }
  return null;
}

async function importChannelOrders(channel, orders) {
  const label = getChannel(channel).label;
  let imported = 0;
  const touchedProducts = new Set();
  for (const remote of orders) {
    const externalId = String(remote.externalId || '').trim();
    if (!externalId) continue;
    const exists = await pool.query(
      `SELECT id FROM channel_orders WHERE channel = $1 AND external_order_id = $2`,
      [channel, externalId]
    );
    if (exists.rows.length) continue;

    const items = [];
    for (const line of remote.items || []) {
      const listing = await matchListing(channel, line);
      const [colorId = '', size = ''] = String(listing?.variant_key || '').split('|');
      items.push({
        product_id: listing?.product_id || null,
        product_name: line.title || 'Item',
        sku: line.sku || listing?.external_sku || null,
        quantity: Number(line.quantity) || 1,
        unit_price: Number(line.price) || 0,
        total: (Number(line.price) || 0) * (Number(line.quantity) || 1),
        variant_color: colorId || null,
        variant_size: size || null,
      });
      if (listing?.product_id) touchedProducts.add(listing.product_id);
    }

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const shippingCost = Number(remote.shippingCost) || 0;
    const total = Number(remote.total) || subtotal + shippingCost;
    const email = remote.customerEmail
      || `${channel}.${externalId.replace(/[^a-zA-Z0-9._-]/g, '')}@marketplace.sorelle`;

    let inserted;
    try {
      inserted = await pool.query(
      `INSERT INTO orders (
         customer_name, customer_email, customer_phone, customer_address,
         items, subtotal, wrapping_cost, shipping_cost, discount_amount,
         total, status, payment_method, payment_status, notes,
         sales_channel, external_order_id
       ) VALUES ($1,$2,$3,$4,$5,$6,0,$7,0,$8,'confirmado','marketplace','pago',$9,$10,$11)
       RETURNING *`,
      [
        remote.customerName || `Comprador ${label}`,
        email.slice(0, 255),
        plainText(remote.customerPhone),
        plainText(remote.address),
        JSON.stringify(items),
        subtotal,
        shippingCost,
        total,
        `Pedido importado de ${label}. Ref ${externalId}`,
        channel,
        externalId,
      ]
    );
    } catch (err) {
      if (err.code === '23505') continue;
      throw err;
    }
    const order = inserted.rows[0];
    await pool.query(
      `INSERT INTO channel_orders (channel, external_order_id, order_id, raw_payload)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [channel, externalId, order.id, JSON.stringify(remote.raw || {})]
    );
    try {
      await consumeStockForOrder(pool, order);
    } catch (err) {
      await writeLog(channel, 'stock', false, `Pedido ${externalId}: ${err.message}`);
    }
    imported += 1;
  }
  if (imported) {
    await writeLog(channel, 'orders', true, `${imported} pedido(s) importado(s) de ${label}.`);
  }
  return touchedProducts;
}

export async function pushProductStock(productId, { exceptChannel = null } = {}) {
  const product = await loadProduct(productId);
  if (!product) return;
  const markup = await getPriceMarkupPercent();
  const units = buildListingUnits(product);
  const listings = await pool.query(
    `SELECT * FROM channel_listings WHERE product_id = $1 AND status = 'published' AND external_id IS NOT NULL`,
    [productId]
  );
  for (const listing of listings.rows) {
    if (listing.channel === exceptChannel) continue;
    const account = await getAccount(listing.channel);
    if (!account || account.status !== 'connected') continue;
    const unit = units.find((item) => item.variantKey === listing.variant_key && !item.skip);
    if (!unit) continue;
    try {
      const adapter = getAdapter(listing.channel);
      const updated = await adapter.updateStock({
        credentials: account.credentials || {},
        externalId: listing.external_id,
        externalVariantId: listing.external_variant_id,
        quantity: unit.quantity,
        price: resolveChannelPrice(unit.price, markup, listing.price_override),
      });
      if (updated.credentials) await rememberCredentials(listing.channel, updated.credentials);
      await pool.query(
        `UPDATE channel_listings SET last_sync_at = NOW(), last_error = NULL, updated_date = NOW() WHERE id = $1`,
        [listing.id]
      );
    } catch (err) {
      await pool.query(
        `UPDATE channel_listings SET last_error = $2, updated_date = NOW() WHERE id = $1`,
        [listing.id, err.message]
      );
      await writeLog(listing.channel, 'stock', false, `${product.name}: ${err.message}`);
    }
  }
}

export function notifyProductStockChanged(productId) {
  pushProductStock(productId).catch((err) => {
    console.error('[omnichannel] Falha ao atualizar estoque:', err.message);
  });
}

async function pullChannel(channel) {
  const account = await getAccount(channel);
  if (!account || account.status !== 'connected') {
    return { channel, skipped: true, message: 'Canal desconectado.' };
  }
  const adapter = getAdapter(channel);
  const pulled = await adapter.pullOrders({ credentials: account.credentials || {} });
  if (pulled.credentials) await rememberCredentials(channel, pulled.credentials);
  const touched = await importChannelOrders(channel, pulled.orders || []);
  for (const productId of touched) {
    await pushProductStock(productId, { exceptChannel: channel });
  }
  return { channel, success: true, imported: pulled.orders?.length || 0 };
}

export async function syncConnectedChannels({ manual = false } = {}) {
  if (running) {
    return { busy: true, message: 'Já existe uma sincronização em andamento.' };
  }
  running = true;
  const summary = [];
  try {
    const accounts = await pool.query(
      `SELECT channel FROM channel_accounts WHERE status = 'connected'`
    );
    if (!accounts.rows.length) {
      const message = 'Nenhum canal conectado. Informe as credenciais e conecte um marketplace.';
      if (manual) await writeLog(null, 'sync', false, message);
      return { success: false, message, results: [] };
    }
    for (const row of accounts.rows) {
      try {
        const result = await pullChannel(row.channel);
        summary.push(result);
        const listings = await pool.query(
          `SELECT DISTINCT product_id FROM channel_listings WHERE channel = $1 AND status = 'published'`,
          [row.channel]
        );
        for (const listing of listings.rows) {
          await pushProductStock(listing.product_id);
        }
        await writeLog(row.channel, 'sync', true, 'Sincronização concluída.');
      } catch (err) {
        await pool.query(
          `UPDATE channel_accounts SET status = 'error', last_error = $2, updated_date = NOW() WHERE channel = $1`,
          [row.channel, err.message]
        );
        await writeLog(row.channel, 'sync', false, err.message);
        summary.push({ channel: row.channel, success: false, message: err.message });
      }
    }
    return { success: true, results: summary };
  } finally {
    running = false;
  }
}

export async function getSyncMinutes() {
  const raw = await getSetting('omnichannel_sync_minutes');
  const minutes = Number.parseInt(raw || '15', 10);
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 240) return 15;
  return minutes;
}

export async function getPriceMarkupPercent() {
  const raw = await getSetting('omnichannel_price_markup_percent');
  const value = Number(raw ?? '0');
  if (!Number.isFinite(value) || value < 0 || value > 500) return 0;
  return Math.round(value * 100) / 100;
}

export async function setPriceMarkupPercent(percent) {
  const value = Number(percent);
  if (!Number.isFinite(value) || value < 0 || value > 500) {
    throw Object.assign(new Error('O acréscimo deve ficar entre 0 e 500%.'), { status: 400 });
  }
  const rounded = Math.round(value * 100) / 100;
  await setSetting('omnichannel_price_markup_percent', String(rounded));
  return rounded;
}

export async function setSyncMinutes(minutes) {
  const value = Number.parseInt(minutes, 10);
  if (!Number.isFinite(value) || value < 5 || value > 240) {
    throw Object.assign(new Error('O intervalo deve ficar entre 5 e 240 minutos.'), { status: 400 });
  }
  await setSetting('omnichannel_sync_minutes', String(value));
  scheduleNext(value);
  return value;
}

function scheduleNext(minutes) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    syncConnectedChannels()
      .catch((err) => console.error('[omnichannel]', err.message))
      .finally(async () => {
        const next = await getSyncMinutes().catch(() => 15);
        scheduleNext(next);
      });
  }, minutes * 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
}

export function startOmnichannelScheduler() {
  getSyncMinutes()
    .then((minutes) => scheduleNext(minutes))
    .catch((err) => console.error('[omnichannel] Agenda não iniciada:', err.message));
}

export function stopOmnichannelScheduler() {
  if (timer) clearTimeout(timer);
  timer = null;
}

export async function listListings() {
  const result = await pool.query(
    `SELECT id, product_id, channel, variant_key, external_id, external_sku, category_id,
            price_override, status, last_error, last_sync_at
     FROM channel_listings
     ORDER BY updated_date DESC`
  );
  return result.rows.map((row) => ({
    ...row,
    price_override: row.price_override == null ? null : Number(row.price_override),
  }));
}

export async function listImportedOrders() {
  const result = await pool.query(
    `SELECT co.channel, co.external_order_id, co.imported_at, co.order_id,
            o.customer_name, o.total, o.status, o.payment_status
     FROM channel_orders co
     LEFT JOIN orders o ON o.id = co.order_id
     ORDER BY co.imported_at DESC
     LIMIT 100`
  );
  return result.rows;
}

export async function listLogs() {
  const result = await pool.query(
    `SELECT id, channel, action, success, message, created_date
     FROM channel_sync_logs
     ORDER BY created_date DESC
     LIMIT 80`
  );
  return result.rows;
}

export function assertChannels(channels) {
  if (!Array.isArray(channels) || !channels.length) {
    throw Object.assign(new Error('Selecione ao menos um canal.'), { status: 400 });
  }
  const unknown = channels.filter((channel) => !CHANNEL_IDS.includes(channel));
  if (unknown.length) {
    throw Object.assign(new Error('Canal desconhecido.'), { status: 400 });
  }
}
