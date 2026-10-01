import crypto from 'crypto';
import { ChannelError, requestJson, requireFields } from '../http.js';

function apiBase(credentials) {
  return String(credentials.api_base || 'https://openapi-b-global.temu.com').replace(/\/$/, '');
}

function sign(secret, params) {
  const keys = Object.keys(params)
    .filter((key) => key !== 'sign' && params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort();
  const raw = keys.map((key) => {
    const value = params[key];
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `${key}${text}`;
  }).join('');
  return crypto.createHash('md5').update(`${secret}${raw}${secret}`).digest('hex').toUpperCase();
}

async function temuCall(credentials, type, extra = {}) {
  requireFields(credentials, ['app_key', 'app_secret', 'access_token']);
  const payload = {
    type,
    app_key: credentials.app_key,
    access_token: credentials.access_token,
    timestamp: String(Math.floor(Date.now() / 1000)),
    data_type: 'JSON',
    ...extra,
  };
  payload.sign = sign(credentials.app_secret, payload);
  const data = await requestJson(`${apiBase(credentials)}/openapi/router`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
  if (data?.success === false) {
    throw new ChannelError(data.errorMsg || data.error_msg || 'A Temu recusou a requisição.');
  }
  return data;
}

export const temuAdapter = {
  id: 'temu',

  async testConnection(credentials) {
    await temuCall(credentials, 'bg.local.goods.list.query', { pageNo: 1, pageSize: 1 });
    return {
      credentials,
      shopId: credentials.app_key,
      shopName: 'Temu',
    };
  },

  async publishListing({ credentials, unit, categoryId, externalId }) {
    if (!categoryId) throw new ChannelError('Informe o ID da categoria Temu.');
    if (!unit.images.length) throw new ChannelError('O produto precisa de uma imagem com URL pública.');
    if (externalId) {
      await temuCall(credentials, 'bg.local.goods.stock.edit', {
        goodsId: Number(externalId),
        skuStockTargetList: unit.externalVariantId
          ? [{ skuId: Number(unit.externalVariantId), stockTarget: Math.max(0, Number(unit.quantity) || 0) }]
          : undefined,
      });
      return {
        credentials,
        externalId: String(externalId),
        externalSku: unit.sku,
        externalVariantId: unit.externalVariantId || null,
      };
    }
    const data = await temuCall(credentials, 'bg.local.goods.add', {
      goodsBasic: {
        goodsName: unit.title.slice(0, 150),
        catId: Number(categoryId),
      },
      goodsDesc: unit.description.slice(0, 2000),
      skuList: [{
        outSkuSn: unit.sku,
        price: Number(unit.price),
        quantity: Math.max(0, Number(unit.quantity) || 0),
        images: unit.images.slice(0, 6),
      }],
    });
    const goodsId = data?.result?.goodsId || data?.result?.goods_id;
    const skuId = data?.result?.skuId || data?.result?.skuList?.[0]?.skuId || null;
    if (!goodsId) {
      throw new ChannelError(data?.errorMsg || 'A Temu não devolveu o ID do anúncio.');
    }
    return {
      credentials,
      externalId: String(goodsId),
      externalSku: unit.sku,
      externalVariantId: skuId ? String(skuId) : null,
    };
  },

  async updateStock({ credentials, externalId, externalVariantId, quantity }) {
    if (!externalId) throw new ChannelError('Anúncio sem ID na Temu.');
    const target = Math.max(0, Number(quantity) || 0);
    const extra = { goodsId: Number(externalId) };
    if (externalVariantId) {
      extra.skuStockTargetList = [{ skuId: Number(externalVariantId), stockTarget: target }];
    }
    await temuCall(credentials, 'bg.local.goods.stock.edit', extra);
    return { credentials };
  },

  async pullOrders({ credentials }) {
    const data = await temuCall(credentials, 'bg.order.list.v2.get', {
      pageNumber: 1,
      pageSize: 50,
    });
    const list = data?.result?.orderList || data?.result?.pageItems || data?.result?.orders || [];
    const orders = list.map((order) => {
      const lines = order.orderList || order.itemList || order.skuList || [order];
      const parent = order.parentOrderMap || order;
      return {
        externalId: String(parent.parentOrderSn || order.parentOrderSn || order.orderSn || order.order_sn),
        customerName: order.recipientName || parent.recipientName || 'Comprador Temu',
        customerEmail: null,
        customerPhone: order.mobile || null,
        address: order.addressLine1 || order.regionName1 || '',
        total: Number(order.amount || parent.amount || 0),
        shippingCost: 0,
        items: lines.map((line) => ({
          externalItemId: line.goodsId ? String(line.goodsId) : null,
          sku: line.outSkuSn || line.extCode || line.skuSn || null,
          title: line.goodsName || line.skuName || 'Item',
          quantity: Number(line.quantity || line.soldQuantity) || 1,
          price: Number(line.price || 0),
        })),
        raw: order,
      };
    }).filter((order) => order.externalId && order.externalId !== 'undefined');
    return { credentials, orders };
  },
};
