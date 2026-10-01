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

export function buildListingUnits(product) {
  const variants = ensureVariantStockMatrix(normalizeProductVariants(product.variants));
  const baseSku = String(product.sku || product.internal_code || '').trim();
  const images = productImageUrls(product);
  const basePrice = Number(product.price) || 0;

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
      weightKg: product.weight_kg != null ? Number(product.weight_kg) : null,
      lengthCm: product.length_cm != null ? Number(product.length_cm) : null,
      widthCm: product.width_cm != null ? Number(product.width_cm) : null,
      heightCm: product.height_cm != null ? Number(product.height_cm) : null,
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
      weightKg: product.weight_kg != null ? Number(product.weight_kg) : null,
      lengthCm: product.length_cm != null ? Number(product.length_cm) : null,
      widthCm: product.width_cm != null ? Number(product.width_cm) : null,
      heightCm: product.height_cm != null ? Number(product.height_cm) : null,
    };
  });
}
