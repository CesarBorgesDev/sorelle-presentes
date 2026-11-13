import { ChannelError, formBody, requestJson, requireFields } from '../http.js';

const API = 'https://api.mercadolibre.com';

const DEFAULT_TOKEN_TTL_SECONDS = 6 * 60 * 60;
const TOKEN_REFRESH_SKEW_MS = 30 * 60 * 1000;

function withTokenMeta(credentials, data) {
  const expiresIn = Number(data.expires_in);
  return {
    ...credentials,
    access_token: data.access_token,
    refresh_token: data.refresh_token || credentials.refresh_token,
    user_id: data.user_id ? String(data.user_id) : credentials.user_id,
    expires_in: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : DEFAULT_TOKEN_TTL_SECONDS,
    access_token_obtained_at: Date.now(),
  };
}

export function mercadoLivreAccessTokenExpiresSoon(credentials, skewMs = TOKEN_REFRESH_SKEW_MS) {
  if (!credentials?.access_token) return true;
  const obtained = Number(credentials.access_token_obtained_at);
  if (!Number.isFinite(obtained) || obtained <= 0) return true;
  const expiresIn = Number(credentials.expires_in) || DEFAULT_TOKEN_TTL_SECONDS;
  return Date.now() >= obtained + expiresIn * 1000 - skewMs;
}

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
    ...withTokenMeta(credentials, data),
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
  return withTokenMeta(credentials, data);
}

async function authorized(credentials, path, options = {}) {
  if (!credentials.access_token && credentials.code) {
    credentials = await exchangeCode(credentials);
  }
  if (
    credentials.refresh_token
    && (!credentials.access_token || mercadoLivreAccessTokenExpiresSoon(credentials))
  ) {
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
    if (credentials.refresh_token && /token|401|invalid|unauthorized|expired/i.test(err.message)) {
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
const LIST_VALUE_ID_ATTRIBUTES = new Set(['EMPTY_GTIN_REASON', 'ITEM_CONDITION']);
const NUMBER_VALUE_NAME_ATTRIBUTES = new Set(['UNITS_PER_PACK', 'UNITS_PER_PACKAGE']);
/** Always send as free text (value_name), even when the value looks numeric. */
const TEXT_VALUE_NAME_ATTRIBUTES = new Set(['BRAND', 'MODEL', 'COLOR', 'SIZE', 'GTIN']);
/** Marcas de catálogo em que o ML costuma exigir GTIN real (EMPTY_GTIN_REASON não basta). */
const BRANDS_REQUIRING_GTIN = [
  'karsten', 'tramontina', 'philips', 'electrolux', 'britânia', 'britania',
  'mondial', 'oster', 'cadence', 'arno', 'consul', 'brastemp',
];

function normalizeGtin(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return '';
  return digits;
}

function normalizePackCount(value, fallback = 1) {
  const n = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 1) return String(fallback);
  return String(Math.min(9999, Math.round(n)));
}

function inferBrand(name, explicit) {
  const fromField = String(explicit || '').trim();
  if (fromField) return fromField.slice(0, 255);
  const text = String(name || '');
  if (/karsten/i.test(text)) return 'Karsten';
  if (/btc\s*decor/i.test(text)) return 'BTC Decor';
  return 'Sorelle';
}

function brandRequiresGtin(brand) {
  const value = String(brand || '').trim().toLowerCase();
  return BRANDS_REQUIRING_GTIN.some((item) => value.includes(item));
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

  const brand = inferBrand(hints.familyName || hints.title, attrs.BRAND || hints.brand);
  attrs.BRAND = brand;

  if (!attrs.COLOR) {
    const color = String(hints.color || '').trim();
    if (color) attrs.COLOR = color.slice(0, 255);
  }
  if (!attrs.SIZE) {
    const size = String(hints.size || '').trim();
    if (size) attrs.SIZE = size.slice(0, 255);
  }

  // Almofadas / kits: 1 embalagem com 1 unidade evita "Quantidade de embalagens" inválida.
  attrs.UNITS_PER_PACK = normalizePackCount(attrs.UNITS_PER_PACK, 1);
  attrs.UNITS_PER_PACKAGE = normalizePackCount(attrs.UNITS_PER_PACKAGE, 1);

  const gtin = normalizeGtin(attrs.GTIN || hints.gtin || '');
  if (gtin) {
    attrs.GTIN = gtin;
    delete attrs.EMPTY_GTIN_REASON;
  } else {
    delete attrs.GTIN;
    if (brandRequiresGtin(brand)) {
      throw new ChannelError(
        `A marca ${brand} exige GTIN/EAN (código de barras de 8 a 14 dígitos). Cadastre o GTIN no produto ou em Atributos do Omnichannel.`
      );
    }
    attrs.EMPTY_GTIN_REASON = String(
      attrs.EMPTY_GTIN_REASON || hints.emptyGtinReason || DEFAULT_EMPTY_GTIN_REASON
    );
  }
  return attrs;
}

function attributeEntries(extra, sku, hints = {}) {
  const attrs = normalizeAttributeMap(extra, hints);
  const list = [];
  if (sku) list.push({ id: 'SELLER_SKU', value_name: String(sku).slice(0, 255) });
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'SELLER_SKU') continue;
    // List/catalog options use value_id.
    if (LIST_VALUE_ID_ATTRIBUTES.has(key)) {
      list.push({ id: key, value_id: value });
      continue;
    }
    // BRAND / MODEL / COLOR / SIZE / GTIN and pack counts always use value_name
    // (numeric-looking values must NOT become value_id).
    if (TEXT_VALUE_NAME_ATTRIBUTES.has(key) || NUMBER_VALUE_NAME_ATTRIBUTES.has(key)) {
      list.push({ id: key, value_name: value.slice(0, 255) });
      continue;
    }
    if (/^\d{5,}$/.test(value)) {
      list.push({ id: key, value_id: value });
      continue;
    }
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
  const familyName = resolveFamilyName(unit, title);
  return {
    brand: inferBrand(familyName, unit?.brand),
    color: unit?.color || '',
    size: unit?.size || '',
    title: familyName,
    familyName,
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
  // Hidden attributes must never surface as required, regardless of other tags.
  if (tags.hidden || tags.read_only || tags.fixed) return false;
  if (attribute.id === 'SELLER_SKU' || attribute.id === 'FAMILY_NAME') return false;
  // GTIN / pack qty are often conditional_required; keep them visible when not hidden.
  if (attribute.id === 'GTIN' || attribute.id === 'UNITS_PER_PACK' || attribute.id === 'UNITS_PER_PACKAGE') {
    return Boolean(tags.required || tags.catalog_required || tags.conditional_required || tags.unit_yield || tags.pack_multiplier);
  }
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

const ATTRIBUTE_PRIORITY = [
  'GTIN', 'BRAND', 'UNITS_PER_PACK', 'UNITS_PER_PACKAGE', 'MODEL', 'COLOR', 'SIZE', 'EMPTY_GTIN_REASON',
];

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

async function ensureSellerId(credentials) {
  if (credentials?.user_id) {
    return { credentials, userId: String(credentials.user_id) };
  }
  const { data, credentials: fresh } = await authorized(credentials, '/users/me');
  const userId = String(data.id || fresh.user_id || '');
  return {
    credentials: { ...fresh, user_id: userId },
    userId,
  };
}

/**
 * Look up an existing seller listing by SELLER_SKU attribute or seller_custom_field.
 * Returns the first matching item id, or null.
 */
async function findExistingItemId(credentials, unit) {
  const sku = String(unit?.sku || '').trim();
  if (!sku) return { credentials, itemId: null };

  const ensured = await ensureSellerId(credentials);
  let next = ensured.credentials;
  const userId = ensured.userId;
  if (!userId) return { credentials: next, itemId: null };

  const queries = [
    `seller_sku=${encodeURIComponent(sku)}`,
    `sku=${encodeURIComponent(sku)}`,
  ];

  for (const query of queries) {
    try {
      const { data, credentials: fresh } = await authorized(
        next,
        `/users/${encodeURIComponent(userId)}/items/search?${query}&limit=5`
      );
      next = fresh;
      const results = Array.isArray(data?.results) ? data.results : [];
      const itemId = results.find((id) => id != null && String(id).trim());
      if (itemId) return { credentials: next, itemId: String(itemId) };
    } catch {
      // Keep trying the next lookup strategy.
    }
  }

  return { credentials: next, itemId: null };
}

async function updateListingDescription(credentials, itemId, plainText) {
  const text = String(plainText || '').trim();
  if (!text || !itemId) return credentials;
  try {
    const put = await authorized(credentials, `/items/${itemId}/description`, {
      method: 'PUT',
      body: { plain_text: text.slice(0, 5000) },
    });
    return put.credentials;
  } catch {
    try {
      const post = await authorized(credentials, `/items/${itemId}/description`, {
        method: 'POST',
        body: { plain_text: text.slice(0, 5000) },
      });
      return post.credentials;
    } catch {
      return credentials;
    }
  }
}

export const mercadoLivreAdapter = {
  id: 'mercado_livre',

  async refreshCredentials(credentials, { force = false } = {}) {
    const current = { ...(credentials || {}) };
    if (!current.refresh_token || !current.client_id || !current.client_secret) {
      throw new ChannelError('Informe App ID, Secret e refresh token para renovar o acesso.');
    }
    if (!force && current.access_token && !mercadoLivreAccessTokenExpiresSoon(current)) {
      return { credentials: current, refreshed: false };
    }
    return { credentials: await refreshToken(current), refreshed: true };
  },

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
    let next = credentials;
    let itemId = externalId ? String(externalId).trim() : '';

    // Before creating, reuse an existing ML listing with the same SKU.
    if (!itemId) {
      const found = await findExistingItemId(next, unit);
      next = found.credentials;
      itemId = found.itemId || '';
    }

    if (itemId) {
      const { data, credentials: fresh } = await authorized(next, `/items/${itemId}`, {
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
      const updatedId = String(data.id || itemId);
      const withDescription = await updateListingDescription(
        fresh,
        updatedId,
        payload.description?.plain_text
      );
      return {
        credentials: withDescription,
        externalId: updatedId,
        externalSku: unit.sku,
        updated: true,
      };
    }

    const { description, ...createBody } = payload;
    const { data, credentials: fresh } = await authorized(next, '/items', {
      method: 'POST',
      body: createBody,
    });
    const createdId = String(data.id);
    const withDescription = await updateListingDescription(
      fresh,
      createdId,
      description?.plain_text
    );
    return {
      credentials: withDescription,
      externalId: createdId,
      externalSku: unit.sku,
      updated: false,
    };
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
        updated: Boolean(published.updated),
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
