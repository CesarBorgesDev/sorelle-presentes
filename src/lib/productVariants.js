import { normalizeProductQuantity } from '@/lib/productStock';

const EMPTY_VARIANTS = { colors: [], sizes: [], stock: [], size_specifications: {} };

function stockKey(colorId, size) {
  return `${colorId || ''}|${size || ''}`;
}

export function normalizeProductVariants(rawVariants) {
  if (!rawVariants || typeof rawVariants !== 'object') {
    return { ...EMPTY_VARIANTS };
  }

  const colors = Array.isArray(rawVariants.colors) ? rawVariants.colors : [];
  const sizes = Array.isArray(rawVariants.sizes)
    ? rawVariants.sizes.map(String).filter(Boolean)
    : [];
  const stock = Array.isArray(rawVariants.stock) ? rawVariants.stock : [];
  const sizeSpecifications = normalizeSizeSpecifications(rawVariants.size_specifications, sizes);

  return { colors, sizes, stock, size_specifications: sizeSpecifications };
}

function normalizeSizeSpecifications(raw, sizes = []) {
  const specs = raw && typeof raw === 'object' ? raw : {};
  const result = {};

  for (const size of sizes) {
    result[size] = String(specs[size] ?? '');
  }

  return result;
}

export function getSizeSpecification(variants, size) {
  const normalized = normalizeProductVariants(variants);
  if (!size) return '';
  return String(normalized.size_specifications?.[size] || '').trim();
}

export function usesSizeStock(variants) {
  return normalizeProductVariants(variants).sizes.length > 0;
}

export function ensureVariantStockMatrix(variants) {
  const normalized = normalizeProductVariants(variants);
  const { colors, sizes } = normalized;

  if (!colors.length && !sizes.length) {
    return normalized;
  }

  const stockMap = new Map(
    normalized.stock.map((entry) => [stockKey(entry.color_id, entry.size), normalizeProductQuantity(entry.quantity)])
  );

  const stock = [];

  if (colors.length && sizes.length) {
    for (const color of colors) {
      for (const size of sizes) {
        stock.push({
          color_id: color.id,
          size,
          quantity: stockMap.get(stockKey(color.id, size)) ?? 0,
        });
      }
    }
  } else if (sizes.length) {
    for (const size of sizes) {
      stock.push({
        color_id: null,
        size,
        quantity: stockMap.get(stockKey(null, size)) ?? 0,
      });
    }
  } else {
    for (const color of colors) {
      stock.push({
        color_id: color.id,
        size: null,
        quantity: stockMap.get(stockKey(color.id, null)) ?? 0,
      });
    }
  }

  return { ...normalized, stock };
}

export function hasProductVariants(variants) {
  const normalized = normalizeProductVariants(variants);
  return normalized.colors.length > 0 || normalized.sizes.length > 0;
}

export function getVariantStock(variants, colorId, size) {
  const normalized = ensureVariantStockMatrix(variants);
  if (!hasProductVariants(normalized)) return null;

  const color = colorId ? String(colorId).trim() : null;
  const selectedSize = size ? String(size).trim() : null;

  const exact = normalized.stock.find((entry) => (
    (entry.color_id || null) === color
    && (entry.size || null) === selectedSize
  ));

  if (exact) return normalizeProductQuantity(exact.quantity);

  if (normalized.sizes.length > 0) {
    return 0;
  }

  if (color && !normalized.sizes.length) {
    return normalized.stock
      .filter((entry) => (entry.color_id || null) === color)
      .reduce((sum, entry) => sum + normalizeProductQuantity(entry.quantity), 0);
  }

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

export function getTotalSizeStock(variants) {
  const normalized = ensureVariantStockMatrix(variants);
  if (!normalized.sizes.length) return null;
  return normalized.stock.reduce((sum, entry) => sum + normalizeProductQuantity(entry.quantity), 0);
}

export function getTotalVariantStock(variants) {
  const normalized = ensureVariantStockMatrix(variants);
  if (!hasProductVariants(normalized)) return null;
  return normalized.stock.reduce((sum, entry) => sum + normalizeProductQuantity(entry.quantity), 0);
}

function usesLegacyProductStock(product, variants) {
  const rawStock = normalizeProductVariants(product?.variants).stock;
  const productQty = normalizeProductQuantity(product?.quantity);
  return rawStock.length === 0 && productQty > 0;
}

function getProductLevelStock(product, variants) {
  const variantTotal = getTotalVariantStock(variants);
  const productQty = normalizeProductQuantity(product?.quantity);

  if (!hasProductVariants(variants)) {
    return productQty;
  }

  if (usesLegacyProductStock(product, variants)) {
    return productQty;
  }

  return variantTotal ?? 0;
}

export function resolveVariantAvailability(product, colorId, size) {
  const variants = ensureVariantStockMatrix(product?.variants);
  const hasVariants = hasProductVariants(variants);
  const productLevelStock = getProductLevelStock(product, variants);

  if (!hasVariants) {
    return { available: productLevelStock > 0, quantity: productLevelStock, requiresSelection: false };
  }

  if (usesLegacyProductStock(product, variants)) {
    return { available: productLevelStock > 0, quantity: productLevelStock, requiresSelection: false };
  }

  if (variants.colors.length > 0 && !colorId) {
    return {
      available: productLevelStock > 0,
      quantity: 0,
      requiresSelection: true,
      missing: 'color',
    };
  }

  if (variants.sizes.length > 0 && !size) {
    return {
      available: productLevelStock > 0,
      quantity: 0,
      requiresSelection: true,
      missing: 'size',
    };
  }

  const quantity = getVariantStock(variants, colorId, size);

  return {
    available: quantity > 0,
    quantity,
    requiresSelection: false,
  };
}

export function buildVariantLabel(colorName, size) {
  const parts = [colorName, size].filter(Boolean);
  return parts.join(' / ');
}
