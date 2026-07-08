import { normalizeProductQuantity } from '@/lib/productStock';

const EMPTY_VARIANTS = { colors: [], sizes: [], stock: [] };

export function normalizeProductVariants(rawVariants) {
  if (!rawVariants || typeof rawVariants !== 'object') {
    return { ...EMPTY_VARIANTS };
  }

  const colors = Array.isArray(rawVariants.colors) ? rawVariants.colors : [];
  const sizes = Array.isArray(rawVariants.sizes)
    ? rawVariants.sizes.map(String).filter(Boolean)
    : [];
  const stock = Array.isArray(rawVariants.stock) ? rawVariants.stock : [];

  return { colors, sizes, stock };
}

export function hasProductVariants(variants) {
  const normalized = normalizeProductVariants(variants);
  return normalized.colors.length > 0 || normalized.sizes.length > 0;
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
  if (exact) return normalizeProductQuantity(exact.quantity);

  return 0;
}

export function getColorImages(product, colorId) {
  const variants = normalizeProductVariants(product?.variants);
  const color = variants.colors.find((item) => item.id === colorId);

  if (color) {
    const images = [
      color.image_url,
      ...(Array.isArray(color.images) ? color.images : []),
    ].filter(Boolean);
    if (images.length) return images;
  }

  return [
    product?.image_url,
    ...(Array.isArray(product?.images) ? product.images : []),
  ].filter(Boolean);
}

export function resolveVariantAvailability(product, colorId, size) {
  const variants = normalizeProductVariants(product?.variants);
  const hasVariants = hasProductVariants(variants);

  if (!hasVariants) {
    const quantity = normalizeProductQuantity(product?.quantity);
    return { available: quantity > 0, quantity, requiresSelection: false };
  }

  if (variants.colors.length > 0 && !colorId) {
    return { available: false, quantity: 0, requiresSelection: true, missing: 'color' };
  }

  if (variants.sizes.length > 0 && !size) {
    return { available: false, quantity: 0, requiresSelection: true, missing: 'size' };
  }

  const variantQuantity = getVariantStock(variants, colorId, size);
  const quantity = variantQuantity != null
    ? variantQuantity
    : normalizeProductQuantity(product?.quantity);

  return { available: quantity > 0, quantity, requiresSelection: false };
}

export function buildVariantLabel(colorName, size) {
  const parts = [colorName, size].filter(Boolean);
  return parts.join(' / ');
}
