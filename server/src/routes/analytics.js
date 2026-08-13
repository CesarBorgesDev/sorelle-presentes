import { Router } from 'express';
import crypto from 'crypto';
import pool from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getClientIp, lookupGeo } from '../services/geoip.js';

const router = Router();

const TZ = 'America/Sao_Paulo';
const PRODUCT_PATH_RE = /^\/produto\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function normalizeVisitorKey(raw) {
  const key = String(raw || '').trim().slice(0, 64);
  if (/^[a-zA-Z0-9_-]{8,64}$/.test(key)) return key;
  return crypto.randomUUID().replace(/-/g, '');
}

function normalizePath(raw) {
  const path = String(raw || '/').trim().slice(0, 500);
  if (!path.startsWith('/')) return '/';
  if (path.startsWith('/admin')) return null;
  return path;
}

function extractProductId(path) {
  const match = String(path || '').match(PRODUCT_PATH_RE);
  return match ? match[1].toLowerCase() : null;
}

/** Registra visita da loja (público). Deduplica por visitante a cada 30 min. */
router.post('/visit', async (req, res) => {
  try {
    const visitorKey = normalizeVisitorKey(req.body?.visitor_key);
    const path = normalizePath(req.body?.path);
    if (!path) {
      return res.json({ ok: true, skipped: true });
    }

    const productId = extractProductId(path);
    const recent = await pool.query(
      `SELECT id FROM site_visits
       WHERE visitor_key = $1
         AND created_date > NOW() - INTERVAL '30 minutes'
       LIMIT 1`,
      [visitorKey]
    );

    const tasks = [];
    let counted = false;

    if (recent.rows.length === 0) {
      const geo = await lookupGeo(getClientIp(req));
      tasks.push(pool.query(
        `INSERT INTO site_visits (visitor_key, path, country, region, city)
         VALUES ($1, $2, $3, $4, $5)`,
        [visitorKey, path, geo.country, geo.region, geo.city]
      ));
      counted = true;
    }

    if (productId) {
      const [recentProduct, product] = await Promise.all([
        pool.query(
          `SELECT id FROM product_views
           WHERE visitor_key = $1 AND product_id = $2
             AND created_date > NOW() - INTERVAL '30 minutes'
           LIMIT 1`,
          [visitorKey, productId]
        ),
        pool.query('SELECT id FROM products WHERE id = $1 LIMIT 1', [productId]),
      ]);

      if (recentProduct.rows.length === 0 && product.rows.length > 0) {
        tasks.push(pool.query(
          `INSERT INTO product_views (visitor_key, product_id) VALUES ($1, $2)`,
          [visitorKey, productId]
        ));
      }
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }

    res.json({ ok: true, visitor_key: visitorKey, counted });
  } catch (err) {
    console.error('Erro ao registrar visita:', err);
    res.status(500).json({ message: 'Erro ao registrar visita' });
  }
});

/** Contagem de visitantes únicos: dia, semana, mês e ano (fuso America/Sao_Paulo). */
router.get('/visitors', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(DISTINCT visitor_key) FILTER (
           WHERE (created_date AT TIME ZONE $1)::date = (NOW() AT TIME ZONE $1)::date
         )::int AS day,
         COUNT(DISTINCT visitor_key) FILTER (
           WHERE created_date >= date_trunc('week', NOW() AT TIME ZONE $1) AT TIME ZONE $1
         )::int AS week,
         COUNT(DISTINCT visitor_key) FILTER (
           WHERE created_date >= date_trunc('month', NOW() AT TIME ZONE $1) AT TIME ZONE $1
         )::int AS month,
         COUNT(DISTINCT visitor_key) FILTER (
           WHERE created_date >= date_trunc('year', NOW() AT TIME ZONE $1) AT TIME ZONE $1
         )::int AS year
       FROM site_visits`,
      [TZ]
    );

    const row = result.rows[0] || {};
    res.json({
      day: row.day || 0,
      week: row.week || 0,
      month: row.month || 0,
      year: row.year || 0,
    });
  } catch (err) {
    console.error('Erro ao buscar visitantes:', err);
    res.status(500).json({ message: 'Erro ao buscar visitantes' });
  }
});

/** Origem geográfica dos acessos (últimos 30 dias). */
router.get('/origins', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COALESCE(NULLIF(TRIM(city), ''), 'Não identificado') AS city,
         COALESCE(NULLIF(TRIM(region), ''), '') AS region,
         COALESCE(NULLIF(TRIM(country), ''), '') AS country,
         COUNT(DISTINCT visitor_key)::int AS visitors
       FROM site_visits
       WHERE created_date >= NOW() - INTERVAL '30 days'
       GROUP BY 1, 2, 3
       ORDER BY visitors DESC, city ASC
       LIMIT 12`
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar origem dos acessos:', err);
    res.status(500).json({ message: 'Erro ao buscar origem dos acessos' });
  }
});

/** Produtos mais visitados (últimos 30 dias). */
router.get('/top-products', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         p.id,
         p.name,
         p.image_url,
         COUNT(*)::int AS views,
         COUNT(DISTINCT pv.visitor_key)::int AS visitors
       FROM product_views pv
       JOIN products p ON p.id = pv.product_id
       WHERE pv.created_date >= NOW() - INTERVAL '30 days'
       GROUP BY p.id, p.name, p.image_url
       ORDER BY views DESC, p.name ASC
       LIMIT 10`
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar produtos mais visitados:', err);
    res.status(500).json({ message: 'Erro ao buscar produtos mais visitados' });
  }
});

export default router;
