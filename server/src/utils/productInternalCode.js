import { normalizeInternalCode } from './productStock.js';

export async function findInternalCodeConflict(pool, code, excludeId = null) {
  const normalized = normalizeInternalCode(code);
  if (!normalized) return null;

  const values = [normalized.toLowerCase()];
  let query = `
    SELECT id, name, internal_code
    FROM products
    WHERE internal_code IS NOT NULL
      AND LOWER(TRIM(internal_code)) = $1
  `;

  if (excludeId) {
    values.push(excludeId);
    query += ` AND id <> $${values.length}`;
  }

  query += ' LIMIT 1';

  const result = await pool.query(query, values);
  return result.rows[0] || null;
}

export async function assertInternalCodeAvailable(pool, code, excludeId = null) {
  const conflict = await findInternalCodeConflict(pool, code, excludeId);
  if (!conflict) return;

  const err = new Error(
    `Já existe um produto com o código interno "${conflict.internal_code}" (${conflict.name}).`
  );
  err.status = 409;
  throw err;
}
