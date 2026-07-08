import { normalizeProductQuantity, syncProductInStock } from './productStock.js';

const EMPTY_VARIANTS = { colors: [], sizes: [], stock: [] };

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeColor(color, index) {
  const name = String(color?.name || '').trim();
  const id = String(color?.id || slugify(name) || `cor-${index + 1}`).trim();

  return {
    id,
    name,
    hex: String(color?.hex || '#cccccc').trim(),
    image_url: color?.image_url?.trim() || null,
    images: Array.isArray(color?.images)
      ? color.images.filter((item) => typeof item === 'string' && item.trim())
      : [],
  };
}

export function normalizeProductVariants(rawVariants) {
  if (!rawVariants || typeof rawVariants !== 'object') {
    return { ...EMPTY_VARIANTS };
  }

  const colors = Array.isArray(rawVariants.colors)
    ? rawVariants.colors.map(normalizeColor).filter((color) => color.name)
    : [];

  const sizes = Array.isArray(rawVariants.sizes)
    ? [...new Set(rawVariants.sizes.map((size) => String(size || '').trim()).filter(Boolean))]
    : [];

  const stock = Array.isArray(rawVariants.stock)
    ? rawVariants.stock.map((entry) => ({
      color_id: String(entry?.color_id || '').trim() || null,
      size: entry?.size ? String(entry.size).trim() : null,
      quantity: normalizeProductQuantity(entry?.quantity),
    }))
    : [];

  return { colors, sizes, stock };
}

export function hasProductVariants(variants) {
  const normalized = normalizeProductVariants(variants);
  return normalized.colors.length > 0 || normalized.sizes.length > 0;
}

export function getTotalVariantStock(variants) {
  const normalized = normalizeProductVariants(variants);
  if (!normalized.stock.length) return null;
  return normalized.stock.reduce((sum, entry) => sum + entry.quantity, 0);
}

export function getVariantStock(variants, colorId, size) {
  const normalized = normalizeProductVariants(variants);
  if (!normalized.stock.length) return null;

  const color = colorId ? String(colorId).trim() : null;
  const selectedSize = size ? String(size).trim() : null;

  const exact = normalized.stock.find((entry) => (
    (entry.color_id || null) === color
    && (entry.size || null) === selectedSize
  ));
  if (exact) return exact.quantity;

  if (color && !selectedSize && !normalized.sizes.length) {
    return normalized.stock
      .filter((entry) => entry.color_id === color)
      .reduce((sum, entry) => sum + entry.quantity, 0);
  }

  if (!color && selectedSize && !normalized.colors.length) {
    return normalized.stock
      .filter((entry) => entry.size === selectedSize)
      .reduce((sum, entry) => sum + entry.quantity, 0);
  }

  return 0;
}

export function resolveVariantAvailability(product, colorId, size) {
  const variants = normalizeProductVariants(product?.variants);
  const hasVariants = hasProductVariants(variants);

  if (!hasVariants) {
    const quantity = normalizeProductQuantity(product?.quantity);
    return { available: quantity > 0, quantity, requiresSelection: false };
  }

  const requiresColor = variants.colors.length > 0;
  const requiresSize = variants.sizes.length > 0;

  if (requiresColor && !colorId) {
    return { available: false, quantity: 0, requiresSelection: true, missing: 'color' };
  }

  if (requiresSize && !size) {
    return { available: false, quantity: 0, requiresSelection: true, missing: 'size' };
  }

  const variantQuantity = getVariantStock(variants, colorId, size);
  const quantity = variantQuantity != null
    ? variantQuantity
    : normalizeProductQuantity(product?.quantity);

  return {
    available: quantity > 0,
    quantity,
    requiresSelection: false,
  };
}

export function applyVariantsToProductPayload(data = {}) {
  const payload = { ...data };

  if (data.variants !== undefined) {
    const variants = normalizeProductVariants(data.variants);
    payload.variants = variants;

    const totalVariantStock = getTotalVariantStock(variants);
    if (totalVariantStock != null && hasProductVariants(variants)) {
      payload.quantity = totalVariantStock;
      payload.in_stock = syncProductInStock(totalVariantStock);
    }
  }

  return payload;
}
