import { normalizeProductQuantity, syncProductInStock } from './productStock.js';
import {
  ensureVariantStockMatrix,
  getTotalVariantStock,
  usesVariantStock,
} from './productVariants.js';

const MOVEMENT_TYPES = new Set(['venda', 'cancelamento', 'ajuste', 'entrada']);

async function insertMovement(client, {
  productId,
  orderId = null,
  type,
  quantityDelta,
  quantityBefore,
  quantityAfter,
  variantColor = null,
  variantSize = null,
  note = null,
  userId = null,
}) {
  if (!MOVEMENT_TYPES.has(type)) {
    throw new Error(`Tipo de movimentação inválido: ${type}`);
  }

  await client.query(
    `INSERT INTO stock_movements (
       product_id, order_id, type, quantity_delta, quantity_before, quantity_after,
       variant_color, variant_size, note, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      productId,
      orderId,
      type,
      quantityDelta,
      quantityBefore,
      quantityAfter,
      variantColor || null,
      variantSize || null,
      note || null,
      userId || null,
    ]
  );
}

/** Aplica delta no client já dentro de uma transação. */
export async function changeProductStockOnClient(client, {
  productId,
  delta,
  variantColor = null,
  variantSize = null,
  type,
  orderId = null,
  note = null,
  userId = null,
}) {
  const deltaInt = Number.parseInt(delta, 10);
  if (!Number.isFinite(deltaInt) || deltaInt === 0) return null;

  const result = await client.query(
    `SELECT id, quantity, variants FROM products WHERE id = $1 FOR UPDATE`,
    [productId]
  );
  if (result.rows.length === 0) {
    throw Object.assign(new Error('Produto não encontrado para movimentação de estoque'), { status: 404 });
  }

  const product = result.rows[0];
  const variants = ensureVariantStockMatrix(product.variants);
  const color = variantColor ? String(variantColor).trim() : null;
  const size = variantSize ? String(variantSize).trim() : null;
  const quantityBefore = normalizeProductQuantity(product.quantity);
  let quantityAfter;

  if (usesVariantStock(variants)) {
    let matched = false;
    const stock = variants.stock.map((entry) => {
      if ((entry.color_id || null) === color && (entry.size || null) === size) {
        matched = true;
        return {
          ...entry,
          quantity: Math.max(0, normalizeProductQuantity(entry.quantity) + deltaInt),
        };
      }
      return entry;
    });

    if (!matched) {
      throw Object.assign(
        new Error('Combinação de cor/tamanho não encontrada no estoque do produto'),
        { status: 400 }
      );
    }

    const nextVariants = { ...variants, stock };
    quantityAfter = getTotalVariantStock(nextVariants);
    await client.query(
      `UPDATE products
       SET variants = $1, quantity = $2, in_stock = $3, updated_date = NOW()
       WHERE id = $4`,
      [
        JSON.stringify(nextVariants),
        quantityAfter,
        syncProductInStock(quantityAfter),
        productId,
      ]
    );
  } else {
    quantityAfter = Math.max(0, quantityBefore + deltaInt);
    await client.query(
      `UPDATE products
       SET quantity = $1, in_stock = $2, updated_date = NOW()
       WHERE id = $3`,
      [quantityAfter, syncProductInStock(quantityAfter), productId]
    );
  }

  await insertMovement(client, {
    productId,
    orderId,
    type,
    quantityDelta: deltaInt,
    quantityBefore,
    quantityAfter,
    variantColor: color,
    variantSize: size,
    note,
    userId,
  });

  return { quantityBefore, quantityAfter, delta: deltaInt };
}

export async function changeProductStock(pool, options) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await changeProductStockOnClient(client, options);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function consumeStockForOrder(pool, order, { userId = null } = {}) {
  if (!order?.id) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const locked = await client.query(
      `SELECT id, stock_consumed, items FROM orders WHERE id = $1 FOR UPDATE`,
      [order.id]
    );
    if (locked.rows.length === 0) {
      throw Object.assign(new Error('Pedido não encontrado'), { status: 404 });
    }
    if (locked.rows[0].stock_consumed) {
      await client.query('COMMIT');
      return;
    }

    const orderItems = Array.isArray(locked.rows[0].items) ? locked.rows[0].items : [];

    for (const item of orderItems) {
      if (!item?.product_id) continue;
      const qty = normalizeProductQuantity(item.quantity);
      if (qty <= 0) continue;

      await changeProductStockOnClient(client, {
        productId: item.product_id,
        delta: -qty,
        variantColor: item.variant_color || null,
        variantSize: item.variant_size || null,
        type: 'venda',
        orderId: order.id,
        note: `Venda — pedido ${String(order.id).slice(0, 8)}`,
        userId,
      });
    }

    await client.query(
      `UPDATE orders SET stock_consumed = TRUE, updated_date = NOW() WHERE id = $1`,
      [order.id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function restoreStockForOrder(pool, order, { userId = null, note = null } = {}) {
  if (!order?.id) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const locked = await client.query(
      `SELECT id, stock_consumed, items FROM orders WHERE id = $1 FOR UPDATE`,
      [order.id]
    );
    if (locked.rows.length === 0) {
      await client.query('COMMIT');
      return;
    }

    const row = locked.rows[0];
    if (!row.stock_consumed) {
      await client.query('COMMIT');
      return;
    }

    const already = await client.query(
      `SELECT 1 FROM stock_movements
       WHERE order_id = $1 AND type = 'cancelamento'
       LIMIT 1`,
      [order.id]
    );
    if (already.rows.length > 0) {
      await client.query('COMMIT');
      return;
    }

    const orderItems = Array.isArray(row.items) ? row.items : [];
    for (const item of orderItems) {
      if (!item?.product_id) continue;
      const qty = normalizeProductQuantity(item.quantity);
      if (qty <= 0) continue;

      await changeProductStockOnClient(client, {
        productId: item.product_id,
        delta: qty,
        variantColor: item.variant_color || null,
        variantSize: item.variant_size || null,
        type: 'cancelamento',
        orderId: order.id,
        note: note || `Estorno — pedido ${String(order.id).slice(0, 8)} cancelado`,
        userId,
      });
    }

    await client.query(
      `UPDATE orders SET stock_consumed = FALSE, updated_date = NOW() WHERE id = $1`,
      [order.id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function recordStockAdjustment(pool, {
  productId,
  quantityBefore,
  quantityAfter,
  userId = null,
  note = 'Ajuste no cadastro do produto',
}) {
  const before = normalizeProductQuantity(quantityBefore);
  const after = normalizeProductQuantity(quantityAfter);
  const delta = after - before;
  if (delta === 0) return null;

  await pool.query(
    `INSERT INTO stock_movements (
       product_id, order_id, type, quantity_delta, quantity_before, quantity_after,
       variant_color, variant_size, note, created_by
     ) VALUES ($1,NULL,$2,$3,$4,$5,NULL,NULL,$6,$7)`,
    [
      productId,
      delta > 0 ? 'entrada' : 'ajuste',
      delta,
      before,
      after,
      note,
      userId || null,
    ]
  );
  return { delta, quantityBefore: before, quantityAfter: after };
}

export async function listProductStockMovements(pool, productId, { limit = 100 } = {}) {
  const result = await pool.query(
    `SELECT
       m.id, m.product_id, m.order_id, m.type, m.quantity_delta,
       m.quantity_before, m.quantity_after, m.variant_color, m.variant_size,
       m.note, m.created_by, m.created_date,
       u.full_name AS created_by_name, u.email AS created_by_email
     FROM stock_movements m
     LEFT JOIN users u ON u.id = m.created_by
     WHERE m.product_id = $1
     ORDER BY m.created_date DESC
     LIMIT $2`,
    [productId, Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500)]
  );
  return result.rows;
}
