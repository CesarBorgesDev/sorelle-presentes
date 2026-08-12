import { Router } from 'express';
import crypto from 'crypto';
import pool from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

const TZ = 'America/Sao_Paulo';

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

/** Registra visita da loja (público). Deduplica por visitante a cada 30 min. */
router.post('/visit', async (req, res) => {
  try {
    const visitorKey = normalizeVisitorKey(req.body?.visitor_key);
    const path = normalizePath(req.body?.path);
    if (!path) {
      return res.json({ ok: true, skipped: true });
    }

    const recent = await pool.query(
      `SELECT id FROM site_visits
       WHERE visitor_key = $1
         AND created_date > NOW() - INTERVAL '30 minutes'
       LIMIT 1`,
      [visitorKey]
    );

    if (recent.rows.length > 0) {
      return res.json({ ok: true, visitor_key: visitorKey, counted: false });
    }

    await pool.query(
      `INSERT INTO site_visits (visitor_key, path) VALUES ($1, $2)`,
      [visitorKey, path]
    );

    res.json({ ok: true, visitor_key: visitorKey, counted: true });
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

export default router;
