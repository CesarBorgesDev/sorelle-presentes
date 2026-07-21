import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { rowToEntity, rowsToEntities } from '../utils/helpers.js';
import { normalizeProductQuantity } from '../utils/productStock.js';
import {
  resolveVariantAvailability,
  resolveVariantPrice,
  getVariantImages,
} from '../utils/productVariants.js';

const router = Router();

router.use(requireAuth);

async function loadProductStock(productId) {
  const result = await pool.query(
    'SELECT id, name, quantity, in_stock, image_url, images, price, original_price, variants FROM products WHERE id = $1',
    [productId]
  );
  return result.rows[0] || null;
}

async function validateCartQuantity(productId, requestedQuantity, variantColor, variantSize) {
  const product = await loadProductStock(productId);
  if (!product) {
    const err = new Error('Produto não encontrado');
    err.status = 404;
    throw err;
  }

  const quantity = normalizeProductQuantity(requestedQuantity);
  const availability = resolveVariantAvailability(product, variantColor, variantSize);

  if (availability.requiresSelection) {
    const err = new Error(
      availability.missing === 'color'
        ? 'Selecione uma cor antes de adicionar ao carrinho'
        : 'Selecione um tamanho antes de adicionar ao carrinho'
    );
    err.status = 400;
    throw err;
  }

  if (!availability.available) {
    const err = new Error(`"${product.name}" está indisponível para a combinação selecionada`);
    err.status = 400;
    throw err;
  }

  if (quantity > availability.quantity) {
    const err = new Error(`Estoque insuficiente para "${product.name}". Disponível: ${availability.quantity}`);
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
    const variantColor = data.variant_color?.trim() || null;
    const variantSize = data.variant_size?.trim() || null;
    const product = await validateCartQuantity(
      data.product_id,
      requestedQuantity,
      variantColor,
      variantSize
    );

    const pricing = resolveVariantPrice(product, variantColor, variantSize);
    const variantImages = getVariantImages(product, variantColor, variantSize);
    const productImage = data.product_image
      || variantImages[0]
      || product.image_url
      || null;

    const result = await pool.query(
      `INSERT INTO cart_items (user_id, product_id, product_name, product_image, price, quantity, wrapping, variant_color, variant_size)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        req.user.id,
        data.product_id,
        data.product_name || product.name,
        productImage,
        pricing.price,
        requestedQuantity,
        data.wrapping || 'none',
        variantColor,
        variantSize,
      ]
    );
    res.status(201).json(rowToEntity(result.rows[0]));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Erro ao adicionar ao carrinho' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const existing = await pool.query(
      'SELECT * FROM cart_items WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Item não encontrado' });
    }

    const item = existing.rows[0];
    const nextQuantity = req.body.quantity !== undefined
      ? normalizeProductQuantity(req.body.quantity)
      : item.quantity;

    const product = await validateCartQuantity(
      item.product_id,
      nextQuantity,
      item.variant_color,
      item.variant_size
    );

    const pricing = resolveVariantPrice(product, item.variant_color, item.variant_size);

    const result = await pool.query(
      `UPDATE cart_items
       SET quantity = $1, price = $2, updated_date = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [nextQuantity, pricing.price, req.params.id, req.user.id]
    );

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
