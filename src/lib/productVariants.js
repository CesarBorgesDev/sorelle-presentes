import { normalizeProductQuantity } from '@/lib/productStock';
import { getProductImages } from '@/lib/productImages';

const EMPTY_VARIANTS = {
  colors: [],
  sizes: [],
  stock: [],
  size_specifications: {},
  size_images: {},
};

function stockKey(colorId, size) {
  return `${colorId || ''}|${size || ''}`;
}

function parseOptionalPrice(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
}

function normalizeSizeImages(raw, sizes = []) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const result = {};

  for (const size of sizes) {
    const entry = source[size];
    if (!entry || typeof entry !== 'object') {
      result[size] = { image_url: null, images: [] };
      continue;
    }
    const imageUrl = typeof entry.image_url === 'string' && entry.image_url.trim()
      ? entry.image_url.trim()
      : null;
    const images = Array.isArray(entry.images)
      ? entry.images.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
      : [];
    result[size] = { image_url: imageUrl, images };
  }

  return result;
}

function normalizeSizeSpecifications(raw, sizes = []) {
  const specs = raw && typeof raw === 'object' ? raw : {};
  const result = {};

  for (const size of sizes) {
    result[size] = String(specs[size] ?? '');
  }

  return result;
}

function normalizeStockEntry(entry) {
  return {
    color_id: entry?.color_id ? String(entry.color_id).trim() : null,
    size: entry?.size ? String(entry.size).trim() : null,
    quantity: normalizeProductQuantity(entry?.quantity),
    price: parseOptionalPrice(entry?.price),
    original_price: parseOptionalPrice(entry?.original_price),
  };
}

export function normalizeProductVariants(rawVariants) {
  if (!rawVariants || typeof rawVariants !== 'object') {
    return { ...EMPTY_VARIANTS };
  }

  const colors = Array.isArray(rawVariants.colors) ? rawVariants.colors : [];
  const sizes = Array.isArray(rawVariants.sizes)
    ? rawVariants.sizes.map(String).filter(Boolean)
    : [];
  const stock = Array.isArray(rawVariants.stock)
    ? rawVariants.stock.map(normalizeStockEntry)
    : [];
  const sizeSpecifications = normalizeSizeSpecifications(rawVariants.size_specifications, sizes);
  const sizeImages = normalizeSizeImages(rawVariants.size_images, sizes);

  return {
    colors,
    sizes,
    stock,
    size_specifications: sizeSpecifications,
    size_images: sizeImages,
  };
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
    normalized.stock.map((entry) => [stockKey(entry.color_id, entry.size), entry])
  );

  const buildCell = (colorId, size) => {
    const previous = stockMap.get(stockKey(colorId, size));
    return {
      color_id: colorId,
      size,
      quantity: previous ? normalizeProductQuantity(previous.quantity) : 0,
      price: previous ? parseOptionalPrice(previous.price) : null,
      original_price: previous ? parseOptionalPrice(previous.original_price) : null,
    };
  };

  const stock = [];

  if (colors.length && sizes.length) {
    for (const color of colors) {
      for (const size of sizes) {
        stock.push(buildCell(color.id, size));
      }
    }
  } else if (sizes.length) {
    for (const size of sizes) {
      stock.push(buildCell(null, size));
    }
  } else {
    for (const color of colors) {
      stock.push(buildCell(color.id, null));
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

function getStockEntry(variants, colorId, size) {
  const normalized = ensureVariantStockMatrix(variants);
  const color = colorId ? String(colorId).trim() : null;
  const selectedSize = size ? String(size).trim() : null;

  return normalized.stock.find((entry) => (
    (entry.color_id || null) === color
    && (entry.size || null) === selectedSize
  )) || null;
}

export function resolveVariantPrice(product, colorId, size) {
  const basePrice = Number(product?.price) || 0;
  const baseOriginal = product?.original_price != null && product.original_price !== ''
    ? Number(product.original_price)
    : null;

  const entry = getStockEntry(product?.variants, colorId, size);
  const overridePrice = entry ? parseOptionalPrice(entry.price) : null;
  const overrideOriginal = entry ? parseOptionalPrice(entry.original_price) : null;

  const price = overridePrice != null ? overridePrice : basePrice;
  const original_price = overrideOriginal != null
    ? overrideOriginal
    : (overridePrice != null ? null : baseOriginal);

  return {
    price,
    original_price: Number.isFinite(original_price) && original_price > 0 ? original_price : null,
    hasOverride: overridePrice != null,
  };
}

/** Menor preço da grade (ou preço base). Usado em cards "A partir de". */
export function getVariantPriceRange(product) {
  const basePrice = Number(product?.price) || 0;
  const variants = ensureVariantStockMatrix(product?.variants);
  const overrides = variants.stock
    .map((entry) => parseOptionalPrice(entry.price))
    .filter((price) => price != null);

  if (!overrides.length) {
    return {
      min: basePrice,
      max: basePrice,
      hasRange: false,
      fromLabel: false,
    };
  }

  const minOverride = Math.min(...overrides);
  const maxOverride = Math.max(...overrides);
  const min = Math.min(basePrice, minOverride);
  const max = Math.max(basePrice, maxOverride);

  return {
    min,
    max,
    hasRange: min < max || min < basePrice,
    fromLabel: min < basePrice || (overrides.length > 0 && min !== basePrice),
  };
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

  return getProductImages(product);
}

export function getSizeImages(product, size) {
  if (!size) return [];
  const variants = normalizeProductVariants(product?.variants);
  const entry = variants.size_images?.[size];
  if (!entry) return [];

  return [
    entry.image_url,
    ...(Array.isArray(entry.images) ? entry.images : []),
  ].filter(Boolean);
}

/** Cor → tamanho → galeria do produto. */
export function getVariantImages(product, colorId, size) {
  if (colorId) {
    const colorImages = getColorImages(product, colorId);
    const productImages = getProductImages(product);
    const isOnlyProductFallback = colorImages.length > 0
      && colorImages.every((url, index) => url === productImages[index])
      && colorImages.length === productImages.length;

    if (colorImages.length && !isOnlyProductFallback) {
      return colorImages;
    }

    // Cor sem foto própria: tenta tamanho
    const sizeImages = getSizeImages(product, size);
    if (sizeImages.length) return sizeImages;
    return productImages;
  }

  const sizeImages = getSizeImages(product, size);
  if (sizeImages.length) return sizeImages;

  return getProductImages(product);
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
