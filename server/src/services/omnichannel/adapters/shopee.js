import crypto from 'crypto';
import { ChannelError, requestJson, requireFields } from '../http.js';

function host(credentials) {
  return credentials.environment === 'sandbox'
    ? 'https://partner.test-stable.shopeemobile.com'
    : 'https://partner.shopeemobile.com';
}

function sign(partnerKey, base) {
  return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}

function signedUrl(credentials, path, { shop = true } = {}) {
  requireFields(credentials, ['partner_id', 'partner_key']);
  const timestamp = Math.floor(Date.now() / 1000);
  const partnerId = String(credentials.partner_id);
  const token = shop ? (credentials.access_token || '') : '';
  const shopId = shop ? (credentials.shop_id || '') : '';
  const base = `${partnerId}${path}${timestamp}${token}${shopId}`;
  const params = new URLSearchParams({
    partner_id: partnerId,
    timestamp: String(timestamp),
    sign: sign(credentials.partner_key, base),
  });
  if (token) params.set('access_token', token);
  if (shopId) params.set('shop_id', String(shopId));
  return `${host(credentials)}${path}?${params}`;
}

async function shopCall(credentials, path, options = {}) {
  requireFields(credentials, ['access_token', 'shop_id']);
  const data = await requestJson(signedUrl(credentials, path), {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (data?.error) {
    throw new ChannelError(data.message || data.error);
  }
  return data;
}

async function uploadImage(credentials, imageUrl) {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new ChannelError('Não foi possível baixar a imagem do produto para a Shopee.');
  }
  const blob = await imageResponse.blob();
  const form = new FormData();
  form.append('image', blob, 'produto.jpg');
  const data = await requestJson(signedUrl(credentials, '/api/v2/media_space/upload_image', { shop: false }), {
    method: 'POST',
    headers: {},
    body: form,
  });
  if (data?.error) throw new ChannelError(data.message || data.error);
  const imageId = data?.response?.image_info?.image_id;
  if (!imageId) throw new ChannelError('A Shopee não devolveu o ID da imagem.');
  return imageId;
}

export const shopeeAdapter = {
  id: 'shopee',

  async testConnection(credentials) {
    requireFields(credentials, ['partner_id', 'partner_key', 'shop_id', 'access_token']);
    const data = await shopCall(credentials, '/api/v2/shop/get_shop_info');
    const info = data.response || {};
    return {
      credentials,
      shopId: String(credentials.shop_id),
      shopName: info.shop_name || 'Shopee',
    };
  },

  async publishListing({ credentials, unit, categoryId, externalId }) {
    if (!categoryId) throw new ChannelError('Informe o category_id da Shopee.');
    if (!unit.weightKg) throw new ChannelError('Informe o peso do produto antes de publicar na Shopee.');
    if (!unit.images.length) throw new ChannelError('O produto precisa de uma imagem com URL pública.');
    const imageIds = [];
    for (const url of unit.images.slice(0, 8)) {
      imageIds.push(await uploadImage(credentials, url));
    }
    const logistics = await shopCall(credentials, '/api/v2/logistics/get_channel_list');
    const logisticInfo = (logistics.response?.logistics_channel_list || [])
      .filter((channel) => channel.enabled)
      .slice(0, 3)
      .map((channel) => ({ logistic_id: channel.logistics_channel_id, enabled: true }));
    if (!logisticInfo.length) {
      throw new ChannelError('A loja Shopee não tem canal de logística habilitado.');
    }
    const body = {
      item_name: unit.title.slice(0, 120),
      description: unit.description.slice(0, 3000) || unit.title,
      original_price: Number(unit.price),
      weight: Number(unit.weightKg),
      item_status: 'NORMAL',
      category_id: Number(categoryId),
      item_sku: unit.sku,
      dimension: {
        package_length: Math.max(1, Math.round(unit.lengthCm || 10)),
        package_width: Math.max(1, Math.round(unit.widthCm || 10)),
        package_height: Math.max(1, Math.round(unit.heightCm || 10)),
      },
      image: { image_id_list: imageIds },
      seller_stock: [{ stock: Math.max(0, Number(unit.quantity) || 0) }],
      logistic_info: logisticInfo,
    };
    if (externalId) {
      const data = await shopCall(credentials, '/api/v2/product/update_item', {
        method: 'POST',
        body: { ...body, item_id: Number(externalId) },
      });
      return {
        credentials,
        externalId: String(data.response?.item_id || externalId),
        externalSku: unit.sku,
      };
    }
    const data = await shopCall(credentials, '/api/v2/product/add_item', {
      method: 'POST',
      body,
    });
    const itemId = data.response?.item_id;
    if (!itemId) throw new ChannelError('A Shopee não devolveu o ID do anúncio.');
    return { credentials, externalId: String(itemId), externalSku: unit.sku };
  },

  async updateStock({ credentials, externalId, quantity, price }) {
    if (!externalId) throw new ChannelError('Anúncio sem ID na Shopee.');
    await shopCall(credentials, '/api/v2/product/update_stock', {
      method: 'POST',
      body: {
        item_id: Number(externalId),
        stock_list: [{ seller_stock: [{ stock: Math.max(0, Number(quantity) || 0) }] }],
      },
    });
    if (price != null && Number.isFinite(Number(price))) {
      await shopCall(credentials, '/api/v2/product/update_price', {
        method: 'POST',
        body: {
          item_id: Number(externalId),
          price_list: [{ original_price: Number(price) }],
        },
      });
    }
    return { credentials };
  },

  async pullOrders({ credentials }) {
    const now = Math.floor(Date.now() / 1000);
    const from = now - 15 * 24 * 60 * 60;
    const params = new URLSearchParams({
      time_range_field: 'create_time',
      time_from: String(from),
      time_to: String(now),
      page_size: '50',
      order_status: 'READY_TO_SHIP',
    });
    const list = await requestJson(`${signedUrl(credentials, '/api/v2/order/get_order_list')}&${params}`);
    if (list?.error) throw new ChannelError(list.message || list.error);
    const sns = (list.response?.order_list || []).map((order) => order.order_sn).filter(Boolean);
    if (!sns.length) return { credentials, orders: [] };
    const detail = await shopCall(credentials, '/api/v2/order/get_order_detail', {
      method: 'POST',
      body: {
        order_sn_list: sns,
        response_optional_fields: 'item_list,buyer_username,recipient_address,total_amount',
      },
    });
    const orders = (detail.response?.order_list || []).map((order) => ({
      externalId: String(order.order_sn),
      customerName: order.buyer_username || order.recipient_address?.name || 'Comprador Shopee',
      customerEmail: null,
      customerPhone: order.recipient_address?.phone || null,
      address: [
        order.recipient_address?.full_address,
        order.recipient_address?.city,
        order.recipient_address?.state,
      ].filter(Boolean).join(', '),
      total: Number(order.total_amount) || 0,
      shippingCost: Number(order.estimated_shipping_fee) || 0,
      items: (order.item_list || []).map((line) => ({
        externalItemId: line.item_id ? String(line.item_id) : null,
        sku: line.model_sku || line.item_sku || null,
        title: line.item_name || 'Item',
        quantity: Number(line.model_quantity_purchased || line.quantity) || 1,
        price: Number(line.model_discounted_price || line.model_original_price) || 0,
      })),
      raw: order,
    }));
    return { credentials, orders };
  },
};
