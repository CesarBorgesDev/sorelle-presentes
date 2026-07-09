import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.js';
import { parseSort, rowToEntity, rowsToEntities } from '../utils/helpers.js';

const router = Router();

const ALLOWED_FIELDS = ['name', 'slug', 'logo_url', 'website_url', 'sort_order', 'active'];

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function buildUniqueSlug(name, excludeId = null) {
  const base = slugify(name) || 'marca';
  let candidate = base;
  let suffix = 2;

  while (true) {
    const values = [candidate];
    let query = 'SELECT id FROM brands WHERE slug = $1';
    if (excludeId) {
      query += ' AND id != $2';
      values.push(excludeId);
    }

    const result = await pool.query(query, values);
    if (result.rows.length === 0) return candidate;

    candidate = `${base}-${suffix}`;
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
      `SELECT * FROM brands ${where} ORDER BY ${column} ${direction}, name ASC LIMIT $1`,
      values
    );
    res.json(rowsToEntities(result.rows));
  } catch (err) {
    console.error('Erro ao listar marcas:', err);
    res.status(500).json({ message: 'Erro ao listar marcas' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM brands WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Marca não encontrada' });
    }

    const brand = rowToEntity(result.rows[0]);
    if (!brand.active && req.user?.role !== 'admin') {
      return res.status(404).json({ message: 'Marca não encontrada' });
    }

    res.json(brand);
  } catch (err) {
    console.error('Erro ao buscar marca:', err);
    res.status(500).json({ message: 'Erro ao buscar marca' });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ message: 'Nome da marca é obrigatório' });
    }

    const slug = req.body.slug?.trim()
      ? slugify(req.body.slug)
      : await buildUniqueSlug(name);

    const result = await pool.query(
      `INSERT INTO brands (name, slug, logo_url, website_url, sort_order, active)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        name,
        slug,
        req.body.logo_url?.trim() || null,
        req.body.website_url?.trim() || null,
        Number(req.body.sort_order) || 0,
        req.body.active !== false,
      ]
    );

    res.status(201).json(rowToEntity(result.rows[0]));
  } catch (err) {
    console.error('Erro ao criar marca:', err);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Já existe uma marca com este slug' });
    }
    res.status(500).json({ message: 'Erro ao criar marca' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const data = { ...req.body };

    if (data.name !== undefined) {
      data.name = String(data.name).trim();
      if (!data.name) {
        return res.status(400).json({ message: 'Nome da marca é obrigatório' });
      }
    }

    if (data.slug !== undefined) {
      data.slug = slugify(data.slug);
      if (!data.slug) {
        return res.status(400).json({ message: 'Slug inválido' });
      }
    } else if (data.name) {
      data.slug = await buildUniqueSlug(data.name, req.params.id);
    }

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
      `UPDATE brands SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Marca não encontrada' });
    }

    res.json(rowToEntity(result.rows[0]));
  } catch (err) {
    console.error('Erro ao atualizar marca:', err);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Já existe uma marca com este slug' });
    }
    res.status(500).json({ message: 'Erro ao atualizar marca' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM brands WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Marca não encontrada' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir marca:', err);
    res.status(500).json({ message: 'Erro ao excluir marca' });
  }
});

export default router;
