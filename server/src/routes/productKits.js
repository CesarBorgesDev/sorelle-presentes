import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.js';
import { parseSort, rowToEntity, rowsToEntities } from '../utils/helpers.js';

const router = Router();

async function loadKitProducts(kitId, anchorProductId) {
  const [anchorResult, itemsResult] = await Promise.all([
    pool.query('SELECT * FROM products WHERE id = $1', [anchorProductId]),
    pool.query(
      `SELECT p.*, ki.sort_order
       FROM product_kit_items ki
       JOIN products p ON p.id = ki.product_id
       WHERE ki.kit_id = $1
       ORDER BY ki.sort_order ASC, ki.created_date ASC`,
      [kitId]
    ),
  ]);

  return {
    anchor_product: rowToEntity(anchorResult.rows[0]),
    related_products: rowsToEntities(itemsResult.rows),
  };
}

async function kitToEntity(kitRow, includeProducts = true) {
  const entity = rowToEntity(kitRow);
  if (!includeProducts) return entity;

  const products = await loadKitProducts(kitRow.id, kitRow.product_id);
  return {
    ...entity,
    ...products,
    product_ids: products.related_products.map((p) => p.id),
  };
}

async function replaceKitItems(kitId, productIds = []) {
  await pool.query('DELETE FROM product_kit_items WHERE kit_id = $1', [kitId]);

  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  for (let i = 0; i < uniqueIds.length; i += 1) {
    await pool.query(
      `INSERT INTO product_kit_items (kit_id, product_id, sort_order)
       VALUES ($1, $2, $3)`,
      [kitId, uniqueIds[i], i]
    );
  }
}

router.get('/by-product/:productId', optionalAuth, async (req, res) => {
  try {
    const { productId } = req.params;

    const kitsResult = await pool.query(
      `SELECT DISTINCT k.*
       FROM product_kits k
       LEFT JOIN product_kit_items ki ON ki.kit_id = k.id
       WHERE k.active = true
         AND (k.product_id = $1 OR ki.product_id = $1)
       ORDER BY k.created_date DESC`,
      [productId]
    );

    const kits = [];

    for (const row of kitsResult.rows) {
      const kit = await kitToEntity(row);
      const allProducts = [kit.anchor_product, ...kit.related_products].filter(Boolean);
      const displayProducts = allProducts.filter((product) => product.id !== productId);

      if (displayProducts.length === 0) continue;

      kits.push({
        id: kit.id,
        name: kit.name,
        products: displayProducts,
      });
    }

    res.json({ kits });
  } catch (err) {
    console.error('Erro ao buscar kits do produto:', err);
    res.status(500).json({ message: 'Erro ao buscar kits relacionados' });
  }
});

router.get('/', optionalAuth, async (req, res) => {
  try {
    const { sort = '-created_date', limit = '100' } = req.query;
    const { column, direction } = parseSort(sort);
    const result = await pool.query(
      `SELECT * FROM product_kits ORDER BY ${column} ${direction} LIMIT $1`,
      [parseInt(limit, 10) || 100]
    );

    const kits = await Promise.all(result.rows.map((row) => kitToEntity(row)));
    res.json(kits);
  } catch (err) {
    console.error('Erro ao listar kits:', err);
    res.status(500).json({ message: 'Erro ao listar kits' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM product_kits WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Kit não encontrado' });
    }

    res.json(await kitToEntity(result.rows[0]));
  } catch (err) {
    console.error('Erro ao buscar kit:', err);
    res.status(500).json({ message: 'Erro ao buscar kit' });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, product_id, active = true, product_ids = [] } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Nome do kit é obrigatório' });
    }
    if (!product_id) {
      return res.status(400).json({ message: 'Produto principal é obrigatório' });
    }

    const productCheck = await pool.query('SELECT id FROM products WHERE id = $1', [product_id]);
    if (productCheck.rows.length === 0) {
      return res.status(400).json({ message: 'Produto principal não encontrado' });
    }

    const filteredIds = product_ids.filter((id) => id && id !== product_id);

    const result = await pool.query(
      `INSERT INTO product_kits (name, product_id, active)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name.trim(), product_id, active !== false]
    );

    const kit = result.rows[0];
    await replaceKitItems(kit.id, filteredIds);

    res.status(201).json(await kitToEntity(kit));
  } catch (err) {
    console.error('Erro ao criar kit:', err);
    res.status(500).json({ message: 'Erro ao criar kit' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, product_id, active, product_ids } = req.body;
    const existing = await pool.query('SELECT * FROM product_kits WHERE id = $1', [req.params.id]);

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Kit não encontrado' });
    }

    const current = existing.rows[0];
    const nextProductId = product_id ?? current.product_id;

    if (product_id) {
      const productCheck = await pool.query('SELECT id FROM products WHERE id = $1', [product_id]);
      if (productCheck.rows.length === 0) {
        return res.status(400).json({ message: 'Produto principal não encontrado' });
      }
    }

    const result = await pool.query(
      `UPDATE product_kits
       SET name = $1,
           product_id = $2,
           active = $3,
           updated_date = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        name?.trim() || current.name,
        nextProductId,
        active !== undefined ? active !== false : current.active,
        req.params.id,
      ]
    );

    if (Array.isArray(product_ids)) {
      const filteredIds = product_ids.filter((id) => id && id !== nextProductId);
      await replaceKitItems(req.params.id, filteredIds);
    }

    res.json(await kitToEntity(result.rows[0]));
  } catch (err) {
    console.error('Erro ao atualizar kit:', err);
    res.status(500).json({ message: 'Erro ao atualizar kit' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM product_kits WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Kit não encontrado' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir kit:', err);
    res.status(500).json({ message: 'Erro ao excluir kit' });
  }
});

export default router;
