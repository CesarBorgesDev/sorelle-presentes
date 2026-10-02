import { ChannelError, formBody, requestJson, requireFields } from '../http.js';

const TOKEN_URL = 'https://id.magalu.com/oauth/token';

function apiBase(credentials) {
  if (credentials.api_base) return String(credentials.api_base).replace(/\/$/, '');
  return credentials.environment === 'sandbox'
    ? 'https://sandbox.api.magalu.com'
    : 'https://api.magalu.com';
}

async function exchangeCode(credentials) {
  requireFields(credentials, ['client_id', 'client_secret', 'code', 'redirect_uri']);
  const data = await requestJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      grant_type: 'authorization_code',
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      code: credentials.code,
      redirect_uri: credentials.redirect_uri,
    }),
  });
  return {
    ...credentials,
    access_token: data.access_token,
    refresh_token: data.refresh_token || credentials.refresh_token,
    code: '',
  };
}

async function refreshToken(credentials) {
  requireFields(credentials, ['client_id', 'client_secret', 'refresh_token']);
  const data = await requestJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      grant_type: 'refresh_token',
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: credentials.refresh_token,
    }),
  });
  return {
    ...credentials,
    access_token: data.access_token,
    refresh_token: data.refresh_token || credentials.refresh_token,
  };
}

async function clientCredentials(credentials) {
  requireFields(credentials, ['client_id', 'client_secret']);
  const data = await requestJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      grant_type: 'client_credentials',
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
    }),
  });
  return { ...credentials, access_token: data.access_token };
}

async function ensureToken(credentials) {
  if (credentials.code) return exchangeCode(credentials);
  if (credentials.access_token) return credentials;
  if (credentials.refresh_token) return refreshToken(credentials);
  return clientCredentials(credentials);
}

async function magalu(credentials, path, options = {}) {
  const next = await ensureToken(credentials);
  requireFields(next, ['access_token']);
  const data = await requestJson(`${apiBase(next)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${next.access_token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return { data, credentials: next };
}

function skuBody(unit, categoryId) {
  if (!categoryId) throw new ChannelError('Informe a categoria da Magazine Luiza.');
  return {
    sku: unit.sku,
    title: unit.title.slice(0, 150),
    description: unit.description.slice(0, 4000),
    active: true,
    brand: 'Sorelle',
    categories: [{ id: categoryId }],
    dimensions: [
      {
        name: 'product',
        height: { value: String(unit.heightCm || 10), unit: 'cm' },
        width: { value: String(unit.widthCm || 10), unit: 'cm' },
        length: { value: String(unit.lengthCm || 10), unit: 'cm' },
        weight: { value: String(Math.round((unit.weightKg || 0.3) * 1000)), unit: 'g' },
      },
    ],
    images: unit.images.slice(0, 8).map((reference) => ({ reference, type: 'image/jpeg' })),
  };
}

export const magaluAdapter = {
  id: 'magalu',

  async testConnection(credentials) {
    const { data, credentials: fresh } = await magalu(credentials, '/seller/v1/portfolios/skus?_offset=0&_limit=1');
    return {
      credentials: fresh,
      shopId: fresh.client_id,
      shopName: data?.channel?.name || 'Magazine Luiza',
    };
  },

  async publishListing({ credentials, unit, categoryId, externalId }) {
    const body = skuBody(unit, categoryId);
    const path = externalId
      ? `/seller/v1/portfolios/skus/${encodeURIComponent(externalId)}`
      : '/seller/v1/portfolios/skus';
    const { credentials: fresh } = await magalu(credentials, path, {
      method: externalId ? 'PUT' : 'POST',
      body,
    });
    await magalu(fresh, '/seller/v1/portfolios/prices', {
      method: 'POST',
      body: {
        sku: unit.sku,
        channel: { id: 'magazineluiza' },
        price: Number(unit.price),
        list_price: Number(unit.price),
        currency: 'BRL',
      },
    });
    await magalu(fresh, '/seller/v1/portfolios/stocks', {
      method: 'POST',
      body: {
        sku: unit.sku,
        channel: { id: 'magazineluiza' },
        quantity: Math.max(0, Number(unit.quantity) || 0),
        type: 'AVAILABLE',
      },
    });
    return { credentials: fresh, externalId: unit.sku, externalSku: unit.sku };
  },

  async updateStock({ credentials, externalId, quantity, price }) {
    const sku = externalId;
    if (!sku) throw new ChannelError('Anúncio sem SKU na Magazine Luiza.');
    const { credentials: fresh } = await magalu(credentials, '/seller/v1/portfolios/stocks', {
      method: 'POST',
      body: {
        sku,
        channel: { id: 'magazineluiza' },
        quantity: Math.max(0, Number(quantity) || 0),
        type: 'AVAILABLE',
      },
    });
    if (price != null && Number.isFinite(Number(price))) {
      await magalu(fresh, '/seller/v1/portfolios/prices', {
        method: 'POST',
        body: {
          sku,
          channel: { id: 'magazineluiza' },
          price: Number(price),
          list_price: Number(price),
          currency: 'BRL',
        },
      });
    }
    return { credentials: fresh };
  },

  async pullOrders({ credentials }) {
    const { data, credentials: fresh } = await magalu(credentials, '/seller/v1/orders?_limit=50');
    const list = data?.results || data?.orders || data?.items || (Array.isArray(data) ? data : []);
    const orders = list.map((order) => {
      const lines = order.items || order.order_items || order.products || [];
      return {
        externalId: String(order.id || order.code || order.order_id),
        customerName: order.customer?.name || order.buyer?.name || 'Comprador Magazine Luiza',
        customerEmail: order.customer?.email || null,
        customerPhone: order.customer?.phone || null,
        address: order.shipping?.address || order.delivery?.address || '',
        total: Number(order.total || order.amounts?.total || 0),
        shippingCost: Number(order.shipping?.price || order.freight || 0),
        items: lines.map((line) => ({
          externalItemId: line.sku || line.id || null,
          sku: line.sku || line.seller_sku || null,
          title: line.title || line.name || 'Item',
          quantity: Number(line.quantity || line.qty) || 1,
          price: Number(line.price || line.unit_price) || 0,
        })),
        raw: order,
      };
    }).filter((order) => order.externalId && order.externalId !== 'undefined');
    return { credentials: fresh, orders };
  },
};
