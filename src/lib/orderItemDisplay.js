/** Código do produto no pedido (internal_code, sku ou product_code). */
export function getOrderItemCode(item) {
  if (!item) return '';
  return String(item.product_code || item.internal_code || item.sku || '').trim();
}

export function getOrderItemCatalogPath(item) {
  if (!item?.product_id) return null;
  return `/produto/${item.product_id}`;
}
