export function normalizeProductQuantity(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

export function syncProductInStock(quantity) {
  return normalizeProductQuantity(quantity) > 0;
}

export function isProductAvailable(product) {
  if (!product) return false;
  return normalizeProductQuantity(product.quantity) > 0;
}

export function normalizeInternalCode(value) {
  const code = String(value || '').trim();
  return code || null;
}

export function normalizeProductStockFields(data = {}) {
  const quantity = data.quantity !== undefined
    ? normalizeProductQuantity(data.quantity)
    : undefined;
  const payload = { ...data };

  if (quantity !== undefined) {
    payload.quantity = quantity;
    payload.in_stock = syncProductInStock(quantity);
  }

  if (data.internal_code !== undefined) {
    payload.internal_code = normalizeInternalCode(data.internal_code);
  }

  return payload;
}
