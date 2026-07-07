import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { rowToEntity, rowsToEntities } from '../utils/helpers.js';
import { isProductAvailable, normalizeProductQuantity } from '../utils/productStock.js';

const router = Router();

router.use(requireAuth);

async function loadProductStock(productId) {
  const result = await pool.query(
    'SELECT id, name, quantity, in_stock, image_url, price FROM products WHERE id = $1',
    [productId]
  );
  return result.rows[0] || null;
}

async function validateCartQuantity(productId, requestedQuantity) {
  const product = await loadProductStock(productId);
  if (!product) {
    const err = new Error('Produto não encontrado');
    err.status = 404;
    throw err;
  }

  const quantity = normalizeProductQuantity(requestedQuantity);
  if (!isProductAvailable(product)) {
    const err = new Error(`"${product.name}" está indisponível (estoque zerado)`);
    err.status = 400;
    throw err;
  }

  if (quantity > normalizeProductQuantity(product.quantity)) {
    const err = new Error(`Estoque insuficiente para "${product.name}". Disponível: ${product.quantity}`);
    err.status = 400;
    throw err;
  }

  return product;
}

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM cart_items WHERE user_id = $1 ORDER BY created_date DESC',
      [req.user.id]
    );
    res.json(rowsToEntities(result.rows));
  } catch (err) {
    res.status(500).json({ message: 'Erro ao listar carrinho' });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const requestedQuantity = normalizeProductQuantity(data.quantity || 1);
    const product = await validateCartQuantity(data.product_id, requestedQuantity);

    const result = await pool.query(
      `INSERT INTO cart_items (user_id, product_id, product_name, product_image, price, quantity, wrapping)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        req.user.id,
        data.product_id,
        data.product_name || product.name,
        data.product_image || product.image_url || null,
        data.price ?? product.price,
        requestedQuantity,
        data.wrapping || 'none',
      ]
    );
    res.status(201).json(rowToEntity(result.rows[0]));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Erro ao adicionar ao carrinho' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const data = req.body;
    const allowed = ['quantity', 'wrapping'];
    const sets = [];
    const values = [];
    let idx = 1;

    if (data.quantity !== undefined) {
      const current = await pool.query(
        'SELECT product_id FROM cart_items WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      if (current.rows.length === 0) {
        return res.status(404).json({ message: 'Item não encontrado' });
      }
      await validateCartQuantity(current.rows[0].product_id, data.quantity);
    }

    for (const field of allowed) {
      if (data[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        values.push(field === 'quantity' ? normalizeProductQuantity(data[field]) : data[field]);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ message: 'Nenhum campo para atualizar' });
    }

    sets.push('updated_date = NOW()');
    values.push(req.params.id, req.user.id);

    const result = await pool.query(
      `UPDATE cart_items SET ${sets.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Item não encontrado' });
    }
    res.json(rowToEntity(result.rows[0]));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Erro ao atualizar item' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Item não encontrado' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Erro ao remover item' });
  }
});

export default router;
