import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.js';
import { parseSort, rowToEntity, rowsToEntities } from '../utils/helpers.js';

const router = Router();

const ALLOWED_FIELDS = ['name', 'slug', 'description', 'sort_order', 'active'];

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

async function buildUniqueSlug(name, excludeId = null) {
  const base = slugify(name) || 'categoria';
  let candidate = base;
  let suffix = 2;

  while (true) {
    const values = [candidate];
    let query = 'SELECT id FROM categories WHERE slug = $1';
    if (excludeId) {
      query += ' AND id != $2';
      values.push(excludeId);
    }

    const result = await pool.query(query, values);
    if (result.rows.length === 0) return candidate;

    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
}

router.get('/', optionalAuth, async (req, res) => {
  try {
    const { sort = 'sort_order', limit = '100', include_inactive } = req.query;
    const isAdmin = req.user?.role === 'admin';
    const showAll = isAdmin && include_inactive === 'true';
    const { column, direction } = parseSort(sort);

    const conditions = showAll ? [] : ['active = true'];
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const values = [parseInt(limit, 10) || 100];

    const result = await pool.query(
      `SELECT * FROM categories ${where} ORDER BY ${column} ${direction}, name ASC LIMIT $1`,
      values
    );
    res.json(rowsToEntities(result.rows));
  } catch (err) {
    console.error('Erro ao listar categorias:', err);
    res.status(500).json({ message: 'Erro ao listar categorias' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Categoria não encontrada' });
    }

    const category = rowToEntity(result.rows[0]);
    if (!category.active && req.user?.role !== 'admin') {
      return res.status(404).json({ message: 'Categoria não encontrada' });
    }

    res.json(category);
  } catch (err) {
    console.error('Erro ao buscar categoria:', err);
    res.status(500).json({ message: 'Erro ao buscar categoria' });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ message: 'Nome da categoria é obrigatório' });
    }

    const slug = req.body.slug?.trim()
      ? slugify(req.body.slug)
      : await buildUniqueSlug(name);

    const result = await pool.query(
      `INSERT INTO categories (name, slug, description, sort_order, active)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        name,
        slug,
        req.body.description?.trim() || null,
        Number(req.body.sort_order) || 0,
        req.body.active !== false,
      ]
    );

    res.status(201).json(rowToEntity(result.rows[0]));
  } catch (err) {
    console.error('Erro ao criar categoria:', err);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Já existe uma categoria com este slug' });
    }
    res.status(500).json({ message: 'Erro ao criar categoria' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const data = { ...req.body };

    if (data.name !== undefined) {
      data.name = String(data.name).trim();
      if (!data.name) {
        return res.status(400).json({ message: 'Nome da categoria é obrigatório' });
      }
    }

    if (data.slug !== undefined) {
      data.slug = slugify(data.slug);
      if (!data.slug) {
        return res.status(400).json({ message: 'Slug inválido' });
      }
    }

    // Se o slug mudar, atualiza os produtos que apontam para o slug antigo
    const currentResult = await pool.query('SELECT slug FROM categories WHERE id = $1', [req.params.id]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Categoria não encontrada' });
    }
    const currentSlug = currentResult.rows[0].slug;

    const sets = [];
    const values = [];
    let idx = 1;

    for (const field of ALLOWED_FIELDS) {
      if (data[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        values.push(data[field]);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ message: 'Nenhum campo para atualizar' });
    }

    sets.push('updated_date = NOW()');
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE categories SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Categoria não encontrada' });
    }

    const updated = rowToEntity(result.rows[0]);
    if (data.slug && data.slug !== currentSlug) {
      await pool.query('UPDATE products SET category = $1 WHERE category = $2', [data.slug, currentSlug]);
    }

    res.json(updated);
  } catch (err) {
    console.error('Erro ao atualizar categoria:', err);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Já existe uma categoria com este slug' });
    }
    res.status(500).json({ message: 'Erro ao atualizar categoria' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const categoryResult = await pool.query('SELECT slug FROM categories WHERE id = $1', [req.params.id]);
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ message: 'Categoria não encontrada' });
    }

    const slug = categoryResult.rows[0].slug;
    const usage = await pool.query('SELECT COUNT(*)::int AS count FROM products WHERE category = $1', [slug]);
    if (usage.rows[0].count > 0) {
      return res.status(409).json({
        message: `Não é possível excluir: ${usage.rows[0].count} produto(s) usam esta categoria`,
      });
    }

    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir categoria:', err);
    res.status(500).json({ message: 'Erro ao excluir categoria' });
  }
});

export default router;
