import { config } from '../../config/env.js';
import { ensureVariantStockMatrix, normalizeProductVariants, usesVariantStock } from '../../utils/productVariants.js';

function slugPart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export function absoluteMediaUrl(url) {
  const value = String(url || '').trim();
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  const base = (config.appPublicUrl || config.frontendUrl || '').replace(/\/$/, '');
  if (!base) return null;
  return `${base}${value.startsWith('/') ? value : `/${value}`}`;
}

export function applyPriceMarkup(price, percent) {
  const cents = Math.round((Number(price) || 0) * 100);
  const pct = Number(percent);
  const safe = Number.isFinite(pct) && pct > 0 ? pct : 0;
  return Math.round(cents * (1 + safe / 100)) / 100;
}

export function resolveChannelPrice(sitePrice, markupPercent, priceOverride) {
  if (priceOverride != null && priceOverride !== '') {
    const value = Number(priceOverride);
    if (Number.isFinite(value) && value >= 0) {
      return Math.round(value * 100) / 100;
    }
  }
  return applyPriceMarkup(sitePrice, markupPercent);
}

export function parsePriceOverride(value) {
  if (value == null || String(value).trim() === '') return null;
  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    throw Object.assign(new Error('Informe um preço válido para o marketplace.'), { status: 400 });
  }
  return Math.round(amount * 100) / 100;
}

export function productImageUrls(product) {
  const raw = [];
  if (product?.image_url) raw.push(product.image_url);
  if (Array.isArray(product?.images)) raw.push(...product.images);
  const urls = [];
  for (const item of raw) {
    const absolute = absoluteMediaUrl(item);
    if (absolute && !urls.includes(absolute)) urls.push(absolute);
  }
  return urls.slice(0, 8);
}

/** Sensible package defaults when measures are missing or invalid (0 / NaN / Infinity / negative). */
export const DEFAULT_SHIPPING = {
  weightKg: 0.3,
  lengthCm: 20,
  widthCm: 15,
  heightCm: 10,
};

function positiveFiniteOrDefault(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export function resolveShippingMeasures(product) {
  return {
    weightKg: positiveFiniteOrDefault(product?.weight_kg, DEFAULT_SHIPPING.weightKg),
    lengthCm: positiveFiniteOrDefault(product?.length_cm, DEFAULT_SHIPPING.lengthCm),
    widthCm: positiveFiniteOrDefault(product?.width_cm, DEFAULT_SHIPPING.widthCm),
    heightCm: positiveFiniteOrDefault(product?.height_cm, DEFAULT_SHIPPING.heightCm),
  };
}

export function buildListingUnits(product) {
  const variants = ensureVariantStockMatrix(normalizeProductVariants(product.variants));
  const baseSku = String(product.sku || product.internal_code || '').trim();
  const images = productImageUrls(product);
  const basePrice = Number(product.price) || 0;
  const shipping = resolveShippingMeasures(product);

  const gtin = String(product.gtin || '').trim() || null;
  const brand = String(product.brand || '').trim() || null;

  if (!usesVariantStock(variants)) {
    return [{
      variantKey: '',
      sku: baseSku || String(product.id).slice(0, 8),
      title: String(product.name || '').trim(),
      description: String(product.description || product.name || '').trim(),
      quantity: Number(product.quantity) || 0,
      price: basePrice,
      color: null,
      size: null,
      images,
      gtin,
      brand,
      ...shipping,
    }];
  }

  return variants.stock.map((entry) => {
    const color = variants.colors.find((item) => item.id === entry.color_id);
    const colorName = color?.name || '';
    const size = entry.size || '';
    const variantKey = `${entry.color_id || ''}|${size}`;
    const suffix = slugPart([colorName || entry.color_id, size].filter(Boolean).join('-'));
    if (!baseSku) {
      return {
        variantKey,
        skip: true,
        reason: 'Produto com variação precisa de SKU ou código interno para publicar cada combinação.',
      };
    }
    return {
      variantKey,
      sku: `${baseSku}-${suffix || 'var'}`.slice(0, 80),
      title: [product.name, colorName, size].filter(Boolean).join(' - ').slice(0, 180),
      description: String(product.description || product.name || '').trim(),
      quantity: Number(entry.quantity) || 0,
      price: entry.price != null ? Number(entry.price) : basePrice,
      color: colorName || null,
      size: size || null,
      images,
      gtin,
      brand,
      ...shipping,
    };
  });
}
