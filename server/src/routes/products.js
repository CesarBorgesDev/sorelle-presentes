import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.js';
import { parseSort, rowToEntity, rowsToEntities } from '../utils/helpers.js';
import { normalizeProductImages } from '../utils/productImages.js';

const router = Router();

const ALLOWED_FIELDS = [
  'name', 'description', 'price', 'original_price', 'category', 'subcategory',
  'image_url', 'images', 'featured', 'in_stock', 'sku', 'materials', 'dimensions',
  'weight_kg', 'length_cm', 'width_cm', 'height_cm',
];

router.get('/', optionalAuth, async (req, res) => {
  try {
    const { sort = '-created_date', limit = '100' } = req.query;
    const { column, direction } = parseSort(sort);
    const result = await pool.query(
      `SELECT * FROM products ORDER BY ${column} ${direction} LIMIT $1`,
      [parseInt(limit) || 100]
    );
    res.json(rowsToEntities(result.rows));
  } catch (err) {
    console.error('Erro ao listar produtos:', err);
    res.status(500).json({ message: 'Erro ao listar produtos' });
  }
});

router.get('/filter', optionalAuth, async (req, res) => {
  try {
    const { sort = '-created_date', limit = '100', id, category, featured, in_stock } = req.query;
    const { column, direction } = parseSort(sort);
    const conditions = [];
    const values = [];
    let idx = 1;

    if (id) { conditions.push(`id = $${idx++}`); values.push(id); }
    if (category) { conditions.push(`category = $${idx++}`); values.push(category); }
    if (featured !== undefined) { conditions.push(`featured = $${idx++}`); values.push(featured === 'true'); }
    if (in_stock !== undefined) { conditions.push(`in_stock = $${idx++}`); values.push(in_stock === 'true'); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(parseInt(limit) || 100);

    const result = await pool.query(
      `SELECT * FROM products ${where} ORDER BY ${column} ${direction} LIMIT $${idx}`,
      values
    );
    res.json(rowsToEntities(result.rows));
  } catch (err) {
    console.error('Erro ao filtrar produtos:', err);
    res.status(500).json({ message: 'Erro ao filtrar produtos' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Produto não encontrado' });
    }
    res.json(rowToEntity(result.rows[0]));
  } catch (err) {
    res.status(500).json({ message: 'Erro ao buscar produto' });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const data = req.body;
    const images = normalizeProductImages(data);
    const result = await pool.query(
      `INSERT INTO products (name, description, price, original_price, category, subcategory, image_url, images, featured, in_stock, sku, materials, dimensions, weight_kg, length_cm, width_cm, height_cm)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [
        data.name, data.description || null, data.price, data.original_price || null,
        data.category, data.subcategory || null, images.image_url,
        JSON.stringify(images.images), data.featured ?? false, data.in_stock ?? true,
        data.sku || null, data.materials || null, data.dimensions || null,
        data.weight_kg ?? null, data.length_cm ?? null, data.width_cm ?? null, data.height_cm ?? null,
      ]
    );
    res.status(201).json(rowToEntity(result.rows[0]));
  } catch (err) {
    console.error('Erro ao criar produto:', err);
    res.status(500).json({ message: 'Erro ao criar produto' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const data = { ...req.body };

    if (data.image_url !== undefined || data.images !== undefined) {
      const current = await pool.query('SELECT image_url, images FROM products WHERE id = $1', [req.params.id]);
      if (current.rows.length === 0) {
        return res.status(404).json({ message: 'Produto não encontrado' });
      }

      const existing = current.rows[0];
      const normalized = normalizeProductImages({
        image_url: data.image_url !== undefined ? data.image_url : existing.image_url,
        images: data.images !== undefined ? data.images : existing.images,
      });

      data.image_url = normalized.image_url;
      data.images = normalized.images;
    }

    const sets = [];
    const values = [];
    let idx = 1;

    for (const field of ALLOWED_FIELDS) {
      if (data[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        values.push(field === 'images' ? JSON.stringify(data[field]) : data[field]);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ message: 'Nenhum campo para atualizar' });
    }

    sets.push(`updated_date = NOW()`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Produto não encontrado' });
    }
    res.json(rowToEntity(result.rows[0]));
  } catch (err) {
    console.error('Erro ao atualizar produto:', err);
    res.status(500).json({ message: 'Erro ao atualizar produto' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Produto não encontrado' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Erro ao excluir produto' });
  }
});

export default router;
