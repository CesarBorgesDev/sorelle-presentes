/**
 * Preenche product_code/sku nos itens do pedido a partir do cadastro do produto
 * quando o snapshot do pedido ainda não tem esses campos.
 */
function collectProductIds(orders) {
  const ids = new Set();
  for (const order of orders) {
    const items = Array.isArray(order?.items) ? order.items : [];
    for (const item of items) {
      if (item?.product_id != null && item.product_id !== '') {
        ids.add(item.product_id);
      }
    }
  }
  return [...ids];
}

function applyProductCodes(items, byId) {
  return items.map((item) => {
    if (!item?.product_id) return item;
    const product = byId.get(item.product_id);
    if (!product) return item;

    const existingCode = String(item.product_code || item.internal_code || item.sku || '').trim();
    const productCode = String(product.internal_code || product.sku || '').trim();

    return {
      ...item,
      product_code: existingCode || productCode || null,
      sku: item.sku || product.sku || null,
    };
  });
}

export async function enrichOrdersItems(pool, orders) {
  if (!Array.isArray(orders) || orders.length === 0) return orders;

  const productIds = collectProductIds(orders);
  if (productIds.length === 0) return orders;

  const result = await pool.query(
    `SELECT id, internal_code, sku FROM products WHERE id = ANY($1::uuid[])`,
    [productIds]
  );
  const byId = new Map(result.rows.map((row) => [row.id, row]));

  for (const order of orders) {
    if (!Array.isArray(order.items) || order.items.length === 0) continue;
    order.items = applyProductCodes(order.items, byId);
  }

  return orders;
}

export async function enrichOrderItems(pool, order) {
  if (!order) return order;
  const [enriched] = await enrichOrdersItems(pool, [order]);
  return enriched;
}
