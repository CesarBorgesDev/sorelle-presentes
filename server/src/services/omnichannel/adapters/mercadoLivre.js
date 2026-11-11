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

const LISTING_TYPES = new Set(['gold_special', 'gold_pro']);

function listingType(credentials) {
  const value = String(credentials?.listing_type_id || 'gold_special').trim();
  return LISTING_TYPES.has(value) ? value : 'gold_special';
}

function shippingMode(credentials) {
  return credentials?.shipping_mode === 'not_specified' ? 'not_specified' : 'me2';
}

function assertPublicImages(urls) {
  if (!urls?.length) throw new ChannelError('O produto precisa de uma imagem com URL pública.');
  if (urls.some((url) => /localhost|127\.0\.0\.1/i.test(url))) {
    throw new ChannelError('A foto precisa de uma URL pública. O Mercado Livre não baixa imagem de localhost.');
  }
}

/** ML value_id: "O produto não tem código cadastrado" */
const DEFAULT_EMPTY_GTIN_REASON = '17055160';

function normalizeGtin(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return '';
  return digits;
}

function normalizeAttributeMap(extra = {}, hints = {}) {
  const attrs = {};
  for (const [id, raw] of Object.entries(extra || {})) {
    const key = String(id || '').trim().toUpperCase();
    const value = String(raw ?? '').trim();
    // family_name is a top-level User Products field, not an attribute.
    if (!key || !value || key === 'FAMILY_NAME') continue;
    attrs[key] = value.slice(0, 255);
  }
  if (!attrs.BRAND) {
    const brand = String(hints.brand || '').trim();
    if (brand) attrs.BRAND = brand.slice(0, 255);
  }
  if (!attrs.COLOR) {
    const color = String(hints.color || '').trim();
    if (color) attrs.COLOR = color.slice(0, 255);
  }
  if (!attrs.SIZE) {
    const size = String(hints.size || '').trim();
    if (size) attrs.SIZE = size.slice(0, 255);
  }

  const gtin = normalizeGtin(attrs.GTIN || hints.gtin || '');
  if (gtin) {
    attrs.GTIN = gtin;
    delete attrs.EMPTY_GTIN_REASON;
  } else {
    delete attrs.GTIN;
    // Categorias com GTIN conditional_required aceitam o motivo no lugar do código.
    if (!attrs.EMPTY_GTIN_REASON) {
      attrs.EMPTY_GTIN_REASON = String(hints.emptyGtinReason || DEFAULT_EMPTY_GTIN_REASON);
    }
  }
  return attrs;
}

function attributeEntries(extra, sku, hints = {}) {
  const attrs = normalizeAttributeMap(extra, hints);
  const list = [];
  if (sku) list.push({ id: 'SELLER_SKU', value_name: String(sku).slice(0, 255) });
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'SELLER_SKU') continue;
    // List attributes (EMPTY_GTIN_REASON etc.) and numeric value_ids use value_id.
    if (key === 'EMPTY_GTIN_REASON' || (/^\d+$/.test(value) && key !== 'GTIN')) {
      list.push({ id: key, value_id: value });
      continue;
    }
    // BRAND / MODEL / COLOR / SIZE / GTIN as free text.
    list.push({ id: key, value_name: value.slice(0, 255) });
  }
  return list;
}

function resolveFamilyName(unit, title) {
  return String(title || unit?.title || '')
    .trim()
    .slice(0, 60);
}

function attributeHints(unit, title) {
  return {
    brand: 'Sorelle',
    color: unit?.color || '',
    size: unit?.size || '',
    familyName: resolveFamilyName(unit, title),
    gtin: unit?.gtin || '',
    emptyGtinReason: DEFAULT_EMPTY_GTIN_REASON,
  };
}

function shippingBody(unit, mode) {
  const shipping = { mode, local_pick_up: false, free_shipping: false };
  const height = Number(unit.heightCm);
  const width = Number(unit.widthCm);
  const length = Number(unit.lengthCm);
  const weightKg = Number(unit.weightKg);
  if (mode === 'me2' && height > 0 && width > 0 && length > 0 && weightKg > 0) {
    const grams = Math.max(1, Math.round(weightKg * 1000));
    shipping.dimensions = `${Math.ceil(height)}x${Math.ceil(width)}x${Math.ceil(length)},${grams}`;
  }
  return shipping;
}

function pictures(units) {
  const urls = [];
  for (const unit of units) {
    for (const url of unit.images || []) {
      if (url && !urls.includes(url)) urls.push(url);
    }
  }
  assertPublicImages(urls);
  return urls.slice(0, 6).map((source) => ({ source }));
}

function itemPayload(unit, categoryId, credentials, attributes, title) {
  if (!/^MLB\d+$/i.test(String(categoryId || '').trim())) {
    throw new ChannelError('Informe a categoria do Mercado Livre (ex.: MLB1234).');
  }
  assertPublicImages(unit.images);
  const familyName = resolveFamilyName(unit, title);
  if (!familyName) {
    throw new ChannelError('Informe o nome do produto: o Mercado Livre exige family_name.');
  }
  // User Products: send family_name (not title). ML generates the public title.
  return {
    family_name: familyName,
    category_id: String(categoryId).trim(),
    price: Number(unit.price),
    currency_id: 'BRL',
    available_quantity: Math.max(0, Number(unit.quantity) || 0),
    buying_mode: 'buy_it_now',
    listing_type_id: listingType(credentials),
    condition: 'new',
    description: { plain_text: String(unit.description || unit.title || familyName).slice(0, 5000) },
    pictures: pictures([unit]),
    shipping: shippingBody(unit, shippingMode(credentials)),
    attributes: attributeEntries(attributes, unit.sku, attributeHints(unit, familyName)),
  };
}

function mapOrder(order) {
  return {
    externalId: String(order.id),
    status: order.status || null,
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
      variationId: line.item?.variation_id ? String(line.item.variation_id) : null,
      sku: line.item?.seller_sku || line.item?.seller_custom_field || null,
      title: line.item?.title || 'Item',
      quantity: Number(line.quantity) || 1,
      price: Number(line.unit_price) || 0,
    })),
    raw: order,
  };
}

function isRequiredAttribute(attribute) {
  const tags = attribute?.tags || {};
  if (tags.read_only || tags.fixed) return false;
  if (attribute.id === 'SELLER_SKU' || attribute.id === 'FAMILY_NAME') return false;
  // GTIN is often conditional_required; show it so the seller can paste the barcode.
  if (attribute.id === 'GTIN') {
    return Boolean(tags.required || tags.catalog_required || tags.conditional_required);
  }
  if (tags.hidden) return false;
  return Boolean(tags.required || tags.catalog_required || tags.conditional_required);
}

export async function searchMercadoLivreCategories(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const data = await requestJson(
    `${API}/sites/MLB/domain_discovery/search?limit=8&q=${encodeURIComponent(q)}`
  );
  const rows = Array.isArray(data) ? data : [];
  return rows.slice(0, 8).map((row) => ({
    category_id: row.category_id,
    category_name: row.category_name,
    domain_name: row.domain_name,
  })).filter((row) => row.category_id);
}

const ATTRIBUTE_PRIORITY = ['GTIN', 'BRAND', 'MODEL', 'COLOR', 'SIZE', 'EMPTY_GTIN_REASON'];

export async function mercadoLivreCategoryAttributes(categoryId) {
  const id = String(categoryId || '').trim().toUpperCase();
  if (!/^MLB\d+$/.test(id)) {
    throw new ChannelError('Informe uma categoria MLB válida.');
  }
  const data = await requestJson(`${API}/categories/${id}/attributes`);
  const rows = Array.isArray(data) ? data : [];
  return rows
    .filter(isRequiredAttribute)
    .sort((a, b) => {
      const ai = ATTRIBUTE_PRIORITY.indexOf(a.id);
      const bi = ATTRIBUTE_PRIORITY.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .slice(0, 20)
    .map((attribute) => ({
      id: attribute.id,
      name: attribute.name,
      value_type: attribute.value_type,
      values: (attribute.values || []).slice(0, 40).map((value) => ({
        id: String(value.id),
        name: value.name,
      })),
    }));
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

  async publishListing({ credentials, unit, categoryId, externalId, attributes, title }) {
    const payload = itemPayload(unit, categoryId, credentials, attributes, title);
    if (externalId) {
      const { data, credentials: fresh } = await authorized(credentials, `/items/${externalId}`, {
        method: 'PUT',
        body: {
          family_name: payload.family_name,
          price: payload.price,
          available_quantity: payload.available_quantity,
          pictures: payload.pictures,
          shipping: payload.shipping,
          attributes: payload.attributes,
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

  async publishCatalog({ credentials, units, categoryId, attributes, title }) {
    const active = (units || []).filter((unit) => !unit.skip);
    if (!active.length) throw new ChannelError('Nenhuma variação com SKU para publicar.');
    const familyName = resolveFamilyName(active[0], title);
    // User Products: each SKU/variation is its own item, grouped by the same family_name.
    // The legacy `variations` array is no longer accepted for new listings.
    let next = { ...credentials };
    const variants = [];
    for (const unit of active) {
      const published = await this.publishListing({
        credentials: next,
        unit,
        categoryId,
        externalId: unit.externalId || null,
        attributes,
        title: familyName,
      });
      next = published.credentials || next;
      variants.push({
        variantKey: unit.variantKey,
        externalId: published.externalId,
        externalVariantId: null,
        sku: unit.sku,
      });
    }
    return { credentials: next, variants };
  },

  async updateStock({ credentials, externalId, externalVariantId, quantity, price }) {
    if (!externalId) throw new ChannelError('Anúncio sem ID no Mercado Livre.');
    const available = Math.max(0, Number(quantity) || 0);
    const body = { available_quantity: available };
    if (price != null && Number.isFinite(Number(price))) body.price = Number(price);
    const path = externalVariantId
      ? `/items/${externalId}/variations/${externalVariantId}`
      : `/items/${externalId}`;
    const { credentials: fresh } = await authorized(credentials, path, { method: 'PUT', body });
    return { credentials: fresh };
  },

  async pullOrders({ credentials }) {
    let next = { ...credentials };
    if (!next.user_id) {
      const me = await this.testConnection(next);
      next = me.credentials;
    }
    const seller = next.user_id;
    const orders = [];
    for (let offset = 0; offset < 200; offset += 50) {
      const { data, credentials: fresh } = await authorized(
        next,
        `/orders/search?seller=${encodeURIComponent(seller)}&order.status=paid&sort=date_desc&limit=50&offset=${offset}`
      );
      next = fresh;
      const page = data.results || [];
      orders.push(...page.map(mapOrder));
      if (page.length < 50) break;
    }
    return { credentials: next, orders };
  },

  async fetchOrder({ credentials, resource }) {
    const path = String(resource || '');
    if (!/^\/orders\/\d+$/.test(path)) {
      throw new ChannelError('Aviso do Mercado Livre sem pedido válido.');
    }
    const { data, credentials: fresh } = await authorized(credentials, path);
    return { credentials: fresh, order: mapOrder(data) };
  },
};
