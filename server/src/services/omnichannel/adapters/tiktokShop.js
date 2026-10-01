import crypto from 'crypto';
import { ChannelError, requestJson, requireFields } from '../http.js';

const API = 'https://open-api.tiktokglobalshop.com';
const AUTH = 'https://auth.tiktok-shops.com';

function signRequest(secret, path, params, body) {
  const keys = Object.keys(params)
    .filter((key) => key !== 'sign' && key !== 'access_token' && params[key] != null && params[key] !== '')
    .sort();
  const query = keys.map((key) => `${key}${params[key]}`).join('');
  const raw = `${secret}${path}${query}${body || ''}${secret}`;
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

async function exchangeCode(credentials) {
  requireFields(credentials, ['app_key', 'app_secret', 'code']);
  const params = new URLSearchParams({
    app_key: credentials.app_key,
    app_secret: credentials.app_secret,
    auth_code: credentials.code,
    grant_type: 'authorized_code',
  });
  const data = await requestJson(`${AUTH}/api/v2/token/get?${params}`);
  if (data?.code && data.code !== 0) {
    throw new ChannelError(data.message || 'Falha ao trocar o code do TikTok Shop.');
  }
  const token = data.data || data;
  return {
    ...credentials,
    access_token: token.access_token,
    refresh_token: token.refresh_token || credentials.refresh_token,
    code: '',
  };
}

async function refreshToken(credentials) {
  requireFields(credentials, ['app_key', 'app_secret', 'refresh_token']);
  const params = new URLSearchParams({
    app_key: credentials.app_key,
    app_secret: credentials.app_secret,
    refresh_token: credentials.refresh_token,
    grant_type: 'refresh_token',
  });
  const data = await requestJson(`${AUTH}/api/v2/token/refresh?${params}`);
  if (data?.code && data.code !== 0) {
    throw new ChannelError(data.message || 'Falha ao renovar o token do TikTok Shop.');
  }
  const token = data.data || data;
  return {
    ...credentials,
    access_token: token.access_token,
    refresh_token: token.refresh_token || credentials.refresh_token,
  };
}

async function tiktok(credentials, path, { method = 'GET', query = {}, body } = {}) {
  requireFields(credentials, ['app_key', 'app_secret', 'access_token']);
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    app_key: credentials.app_key,
    timestamp: String(timestamp),
    ...query,
  };
  if (credentials.shop_cipher) params.shop_cipher = credentials.shop_cipher;
  const bodyText = body ? JSON.stringify(body) : '';
  params.sign = signRequest(credentials.app_secret, path, params, bodyText);
  const search = new URLSearchParams(params);
  const data = await requestJson(`${API}${path}?${search}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-tts-access-token': credentials.access_token,
    },
    body: bodyText || undefined,
  });
  if (data?.code && data.code !== 0) {
    throw new ChannelError(data.message || `TikTok Shop recusou ${path}.`);
  }
  return data;
}

async function ensureShop(credentials) {
  let next = { ...credentials };
  if (next.code) next = await exchangeCode(next);
  if (!next.access_token && next.refresh_token) next = await refreshToken(next);
  if (next.shop_cipher) return next;
  const data = await tiktok(next, '/authorization/202309/shops');
  const shop = data?.data?.shops?.[0];
  if (!shop) throw new ChannelError('Nenhuma loja autorizada no TikTok Shop.');
  return {
    ...next,
    shop_id: String(shop.id || shop.shop_id || next.shop_id || ''),
    shop_cipher: shop.cipher || shop.shop_cipher,
    shop_name: shop.name || shop.shop_name || 'TikTok Shop',
  };
}

async function warehouseId(credentials) {
  if (credentials.warehouse_id) return { credentials, warehouseId: credentials.warehouse_id };
  const data = await tiktok(credentials, '/logistics/202309/warehouses');
  const warehouse = (data?.data?.warehouses || []).find((item) => item.type !== 'RETURN') || data?.data?.warehouses?.[0];
  if (!warehouse?.id) throw new ChannelError('Informe o warehouse ID do TikTok Shop.');
  return {
    credentials: { ...credentials, warehouse_id: String(warehouse.id) },
    warehouseId: String(warehouse.id),
  };
}

export const tiktokShopAdapter = {
  id: 'tiktok_shop',

  async testConnection(credentials) {
    const next = await ensureShop(credentials);
    const stock = await warehouseId(next);
    return {
      credentials: stock.credentials,
      shopId: stock.credentials.shop_id || '',
      shopName: stock.credentials.shop_name || 'TikTok Shop',
    };
  },

  async publishListing({ credentials, unit, categoryId, externalId }) {
    if (!categoryId) throw new ChannelError('Informe a categoria do TikTok Shop.');
    if (!unit.images.length) throw new ChannelError('O produto precisa de uma imagem com URL pública.');
    const ready = await ensureShop(credentials);
    const stock = await warehouseId(ready);
    const body = {
      save_mode: 'LISTING',
      title: unit.title.slice(0, 255),
      description: `<p>${unit.description.slice(0, 2000).replace(/[<>]/g, '')}</p>`,
      category_id: String(categoryId),
      main_images: unit.images.slice(0, 8).map((uri) => ({ uri })),
      package_weight: { value: String(unit.weightKg || 0.3), unit: 'KILOGRAM' },
      package_dimensions: {
        length: String(Math.max(1, Math.round(unit.lengthCm || 10))),
        width: String(Math.max(1, Math.round(unit.widthCm || 10))),
        height: String(Math.max(1, Math.round(unit.heightCm || 10))),
        unit: 'CENTIMETER',
      },
      skus: [{
        seller_sku: unit.sku,
        price: { amount: Number(unit.price).toFixed(2), currency: 'BRL' },
        inventory: [{ warehouse_id: stock.warehouseId, quantity: Math.max(0, Number(unit.quantity) || 0) }],
      }],
    };
    const path = externalId
      ? `/product/202309/products/${externalId}`
      : '/product/202309/products';
    const data = await tiktok(stock.credentials, path, {
      method: externalId ? 'PUT' : 'POST',
      body,
    });
    const productId = data?.data?.product_id || externalId;
    const skuId = data?.data?.skus?.[0]?.id || null;
    if (!productId) throw new ChannelError(data?.message || 'O TikTok Shop não devolveu o ID do produto.');
    return {
      credentials: stock.credentials,
      externalId: String(productId),
      externalSku: unit.sku,
      externalVariantId: skuId ? String(skuId) : null,
    };
  },

  async updateStock({ credentials, externalId, externalVariantId, quantity }) {
    if (!externalId) throw new ChannelError('Anúncio sem ID no TikTok Shop.');
    const ready = await ensureShop(credentials);
    const stock = await warehouseId(ready);
    const sku = externalVariantId ? { id: externalVariantId } : {};
    await tiktok(stock.credentials, `/product/202309/products/${externalId}/inventory/update`, {
      method: 'POST',
      body: {
        skus: [{
          ...sku,
          inventory: [{ warehouse_id: stock.warehouseId, quantity: Math.max(0, Number(quantity) || 0) }],
        }],
      },
    });
    return { credentials: stock.credentials };
  },

  async pullOrders({ credentials }) {
    const ready = await ensureShop(credentials);
    const since = Math.floor(Date.now() / 1000) - 15 * 24 * 60 * 60;
    const data = await tiktok(ready, '/order/202309/orders/search', {
      method: 'POST',
      query: { page_size: '50' },
      body: { create_time_ge: since },
    });
    const orders = (data?.data?.orders || []).map((order) => ({
      externalId: String(order.id),
      customerName: order.recipient_address?.name || order.buyer_email || 'Comprador TikTok Shop',
      customerEmail: order.buyer_email || null,
      customerPhone: order.recipient_address?.phone_number || null,
      address: [
        order.recipient_address?.address_line1,
        order.recipient_address?.address_line2,
        order.recipient_address?.district,
        order.recipient_address?.city,
        order.recipient_address?.state,
      ].filter(Boolean).join(', '),
      total: Number(order.payment?.total_amount || 0),
      shippingCost: Number(order.payment?.shipping_fee || 0),
      items: (order.line_items || []).map((line) => ({
        externalItemId: line.product_id ? String(line.product_id) : null,
        sku: line.seller_sku || null,
        title: line.product_name || 'Item',
        quantity: 1,
        price: Number(line.sale_price || line.original_price) || 0,
      })),
      raw: order,
    }));
    return { credentials: ready, orders };
  },
};
