export function parseSort(sortParam) {
  if (!sortParam) return { column: 'created_date', direction: 'DESC' };
  const desc = sortParam.startsWith('-');
  const column = desc ? sortParam.slice(1) : sortParam;
  const allowed = ['created_date', 'updated_date', 'name', 'price', 'total', 'status', 'sort_order', 'internal_code'];
  const safeColumn = allowed.includes(column) ? column : 'created_date';
  return { column: safeColumn, direction: desc ? 'DESC' : 'ASC' };
}

const NUMERIC_FIELDS = [
  'price', 'original_price', 'subtotal', 'wrapping_cost', 'total',
  'commission_rate', 'commission_value', 'order_total', 'total_sales',
  'total_commission', 'quantity', 'sort_order',
];

export function rowToEntity(row) {
  if (!row) return null;
  const entity = { ...row };
  for (const key of Object.keys(entity)) {
    if (entity[key] instanceof Date) {
      entity[key] = entity[key].toISOString();
    }
  }
  for (const field of NUMERIC_FIELDS) {
    if (entity[field] !== undefined && entity[field] !== null) {
      entity[field] = parseFloat(entity[field]);
    }
  }
  return entity;
}

export function rowsToEntities(rows) {
  return rows.map(rowToEntity);
}
