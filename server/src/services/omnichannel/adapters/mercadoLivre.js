import { ChannelError, formBody, requestJson, requireFields } from '../http.js';

const API = 'https://api.mercadolibre.com';

async function exchangeCode(credentials) {
  requireFields(credentials, ['client_id', 'client_secret', 'code', 'redirect_uri']);
  const data = await requestJson(`${API}/oauth/token`, {
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
    user_id: data.user_id ? String(data.user_id) : credentials.user_id,
    code: '',
  };
}

async function refreshToken(credentials) {
  requireFields(credentials, ['client_id', 'client_secret', 'refresh_token']);
  const data = await requestJson(`${API}/oauth/token`, {
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
    user_id: data.user_id ? String(data.user_id) : credentials.user_id,
  };
}

async function authorized(credentials, path, options = {}) {
  if (!credentials.access_token && credentials.code) {
    credentials = await exchangeCode(credentials);
  }
  if (!credentials.access_token && credentials.refresh_token) {
    credentials = await refreshToken(credentials);
  }
  requireFields(credentials, ['access_token']);
  try {
    const data = await requestJson(`${API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    return { data, credentials };
  } catch (err) {
    if (credentials.refresh_token && /token|401|invalid/i.test(err.message)) {
      const next = await refreshToken(credentials);
      const data = await requestJson(`${API}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${next.access_token}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
      return { data, credentials: next };
    }
    throw err;
  }
}

function itemPayload(unit, categoryId) {
  if (!categoryId) throw new ChannelError('Informe a categoria do Mercado Livre (ex.: MLB1234).');
  if (!unit.images.length) throw new ChannelError('O produto precisa de uma imagem com URL pública.');
  return {
    title: unit.title.slice(0, 60),
    category_id: categoryId,
    price: Number(unit.price),
    currency_id: 'BRL',
    available_quantity: Math.max(0, Number(unit.quantity) || 0),
    buying_mode: 'buy_it_now',
    listing_type_id: 'gold_special',
    condition: 'new',
    description: { plain_text: unit.description.slice(0, 5000) },
    pictures: unit.images.slice(0, 6).map((source) => ({ source })),
    attributes: [
      { id: 'SELLER_SKU', value_name: unit.sku },
    ],
  };
}

export const mercadoLivreAdapter = {
  id: 'mercado_livre',

  async testConnection(credentials) {
    let next = { ...credentials };
    if (next.code) next = await exchangeCode(next);
    const { data, credentials: fresh } = await authorized(next, '/users/me');
    return {
      credentials: { ...fresh, user_id: String(data.id || fresh.user_id || '') },
      shopId: String(data.id || ''),
      shopName: data.nickname || data.first_name || 'Mercado Livre',
    };
  },

  async publishListing({ credentials, unit, categoryId, externalId }) {
    const payload = itemPayload(unit, categoryId);
    if (externalId) {
      const { data, credentials: fresh } = await authorized(credentials, `/items/${externalId}`, {
        method: 'PUT',
        body: {
          title: payload.title,
          price: payload.price,
          available_quantity: payload.available_quantity,
          pictures: payload.pictures,
        },
      });
      return {
        credentials: fresh,
        externalId: String(data.id || externalId),
        externalSku: unit.sku,
      };
    }
    const { description, ...createBody } = payload;
    const { data, credentials: fresh } = await authorized(credentials, '/items', {
      method: 'POST',
      body: createBody,
    });
    const itemId = String(data.id);
    if (description?.plain_text) {
      await authorized(fresh, `/items/${itemId}/description`, {
        method: 'POST',
        body: { plain_text: description.plain_text },
      }).catch(() => {});
    }
    return { credentials: fresh, externalId: itemId, externalSku: unit.sku };
  },

  async updateStock({ credentials, externalId, quantity, price }) {
    if (!externalId) throw new ChannelError('Anúncio sem ID no Mercado Livre.');
    const body = { available_quantity: Math.max(0, Number(quantity) || 0) };
    if (price != null && Number.isFinite(Number(price))) body.price = Number(price);
    const { credentials: fresh } = await authorized(credentials, `/items/${externalId}`, {
      method: 'PUT',
      body,
    });
    return { credentials: fresh };
  },

  async pullOrders({ credentials }) {
    let next = { ...credentials };
    if (!next.user_id) {
      const me = await this.testConnection(next);
      next = me.credentials;
    }
    const seller = next.user_id;
    const { data, credentials: fresh } = await authorized(
      next,
      `/orders/search?seller=${encodeURIComponent(seller)}&order.status=paid&sort=date_desc&limit=50`
    );
    const orders = (data.results || []).map((order) => ({
      externalId: String(order.id),
      customerName: order.buyer?.nickname || 'Comprador Mercado Livre',
      customerEmail: null,
      customerPhone: null,
      address: [
        order.shipping?.receiver_address?.street_name,
        order.shipping?.receiver_address?.street_number,
        order.shipping?.receiver_address?.city?.name,
        order.shipping?.receiver_address?.state?.name,
      ].filter(Boolean).join(', '),
      total: Number(order.total_amount) || 0,
      shippingCost: Number(order.shipping?.cost) || 0,
      items: (order.order_items || []).map((line) => ({
        externalItemId: line.item?.id ? String(line.item.id) : null,
        sku: line.item?.seller_sku || line.item?.seller_custom_field || null,
        title: line.item?.title || 'Item',
        quantity: Number(line.quantity) || 1,
        price: Number(line.unit_price) || 0,
      })),
      raw: order,
    }));
    return { credentials: fresh, orders };
  },
};
