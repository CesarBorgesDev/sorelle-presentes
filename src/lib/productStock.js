export function normalizeProductQuantity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

export function isProductAvailable(product) {
  if (!product) return false;
  return normalizeProductQuantity(product.quantity) > 0;
}
