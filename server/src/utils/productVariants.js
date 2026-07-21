import { normalizeProductQuantity, syncProductInStock } from './productStock.js';

const EMPTY_VARIANTS = {
  colors: [],
  sizes: [],
  stock: [],
  size_specifications: {},
  size_images: {},
};

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function stockKey(colorId, size) {
  return `${colorId || ''}|${size || ''}`;
}

function parseOptionalPrice(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
}

function normalizeColor(color, index) {
  const name = String(color?.name || '').trim();
  const id = String(color?.id || slugify(name) || `cor-${index + 1}`).trim();
  const imageUrl = color?.image_url?.trim() || null;
  const images = Array.isArray(color?.images)
    ? color.images.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];

  return {
    id,
    name,
    hex: String(color?.hex || '#cccccc').trim(),
    image_url: imageUrl,
    images,
  };
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
    color_id: String(entry?.color_id || '').trim() || null,
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

  const colors = Array.isArray(rawVariants.colors)
    ? rawVariants.colors.map(normalizeColor).filter((color) => color.name)
    : [];

  const sizes = Array.isArray(rawVariants.sizes)
    ? [...new Set(rawVariants.sizes.map((size) => String(size || '').trim()).filter(Boolean))]
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

export function usesVariantStock(variants) {
  const normalized = normalizeProductVariants(variants);
  return normalized.sizes.length > 0 || normalized.colors.length > 0;
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

export function getTotalVariantStock(variants) {
  const normalized = ensureVariantStockMatrix(variants);
  if (!usesVariantStock(normalized)) return null;
  return normalized.stock.reduce((sum, entry) => sum + entry.quantity, 0);
}

export function getVariantStock(variants, colorId, size) {
  const normalized = ensureVariantStockMatrix(variants);
  if (!usesVariantStock(normalized)) return null;

  const color = colorId ? String(colorId).trim() : null;
  const selectedSize = size ? String(size).trim() : null;

  const exact = normalized.stock.find((entry) => (
    (entry.color_id || null) === color
    && (entry.size || null) === selectedSize
  ));

  if (exact) return exact.quantity;

  if (normalized.sizes.length > 0) {
    return 0;
  }

  if (color && !normalized.sizes.length) {
    return normalized.stock
      .filter((entry) => entry.color_id === color)
      .reduce((sum, entry) => sum + entry.quantity, 0);
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

function getProductGallery(product) {
  return [
    product?.image_url,
    ...(Array.isArray(product?.images) ? product.images : []),
  ].filter((url) => typeof url === 'string' && url.trim()).map((url) => url.trim());
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

  return getProductGallery(product);
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

export function getVariantImages(product, colorId, size) {
  if (colorId) {
    const colorImages = getColorImages(product, colorId);
    const productImages = getProductGallery(product);
    const isOnlyProductFallback = colorImages.length > 0
      && colorImages.every((url, index) => url === productImages[index])
      && colorImages.length === productImages.length;

    if (colorImages.length && !isOnlyProductFallback) {
      return colorImages;
    }

    const sizeImages = getSizeImages(product, size);
    if (sizeImages.length) return sizeImages;
    return productImages;
  }

  const sizeImages = getSizeImages(product, size);
  if (sizeImages.length) return sizeImages;

  return getProductGallery(product);
}

function usesLegacyProductStock(product, variants) {
  const rawStock = normalizeProductVariants(product?.variants).stock;
  const productQty = normalizeProductQuantity(product?.quantity);
  return rawStock.length === 0 && productQty > 0;
}

function getProductLevelStock(product, variants) {
  const variantTotal = getTotalVariantStock(variants);
  const productQty = normalizeProductQuantity(product?.quantity);

  if (!usesVariantStock(variants)) {
    return productQty;
  }

  if (usesLegacyProductStock(product, variants)) {
    return productQty;
  }

  return variantTotal ?? 0;
}

export function resolveVariantAvailability(product, colorId, size) {
  const variants = ensureVariantStockMatrix(product?.variants);
  const hasVariants = usesVariantStock(variants);
  const productLevelStock = getProductLevelStock(product, variants);

  if (!hasVariants) {
    return { available: productLevelStock > 0, quantity: productLevelStock, requiresSelection: false };
  }

  if (usesLegacyProductStock(product, variants)) {
    return { available: productLevelStock > 0, quantity: productLevelStock, requiresSelection: false };
  }

  const requiresColor = variants.colors.length > 0;
  const requiresSize = variants.sizes.length > 0;

  if (requiresColor && !colorId) {
    return {
      available: productLevelStock > 0,
      quantity: 0,
      requiresSelection: true,
      missing: 'color',
    };
  }

  if (requiresSize && !size) {
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

export function applyVariantsToProductPayload(data = {}) {
  const payload = { ...data };

  if (data.variants !== undefined) {
    const variants = ensureVariantStockMatrix(data.variants);
    payload.variants = variants;

    if (usesVariantStock(variants)) {
      const totalVariantStock = getTotalVariantStock(variants);
      payload.quantity = totalVariantStock;
      payload.in_stock = syncProductInStock(totalVariantStock);
    }
  }

  return payload;
}

export async function decrementProductVariantStock(pool, productId, colorId, size, amount) {
  const result = await pool.query('SELECT variants FROM products WHERE id = $1', [productId]);
  if (result.rows.length === 0) return;

  const variants = ensureVariantStockMatrix(result.rows[0].variants);
  if (!usesVariantStock(variants)) return;

  const color = colorId ? String(colorId).trim() : null;
  const selectedSize = size ? String(size).trim() : null;
  const decrementBy = normalizeProductQuantity(amount);

  const stock = variants.stock.map((entry) => {
    if ((entry.color_id || null) === color && (entry.size || null) === selectedSize) {
      return {
        ...entry,
        quantity: Math.max(0, entry.quantity - decrementBy),
      };
    }
    return entry;
  });

  const nextVariants = { ...variants, stock };
  const totalQuantity = getTotalVariantStock(nextVariants);

  await pool.query(
    `UPDATE products
     SET variants = $1,
         quantity = $2,
         in_stock = $3,
         updated_date = NOW()
     WHERE id = $4`,
    [
      JSON.stringify(nextVariants),
      totalQuantity,
      syncProductInStock(totalQuantity),
      productId,
    ]
  );
}
