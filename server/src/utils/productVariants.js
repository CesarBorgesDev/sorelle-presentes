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

function stockKey(colorId, size) {
  return `${colorId || ''}|${size || ''}`;
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
    normalized.stock.map((entry) => [stockKey(entry.color_id, entry.size), entry.quantity])
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

export function resolveVariantAvailability(product, colorId, size) {
  const variants = ensureVariantStockMatrix(product?.variants);
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
