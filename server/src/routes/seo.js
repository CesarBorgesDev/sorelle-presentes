import { Router } from 'express';
import pool from '../config/db.js';
import { config } from '../config/env.js';
import { CONTENT_PAGES } from '../services/contentPages.js';

const router = Router();

function siteOrigin() {
  const fromEnv = (config.frontendUrl || '').replace(/\/$/, '');
  if (fromEnv.startsWith('http') && !/localhost|127\.0\.0\.1/.test(fromEnv)) {
    return fromEnv.replace(/^http:\/\//, 'https://');
  }
  return 'https://sorellepresentes.com.br';
}

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function urlEntry(loc, { lastmod, changefreq, priority } = {}) {
  const parts = [`  <url>`, `    <loc>${xmlEscape(loc)}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) parts.push(`    <priority>${priority}</priority>`);
  parts.push('  </url>');
  return parts.join('\n');
}

router.get('/sitemap.xml', async (_req, res) => {
  const origin = siteOrigin();
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    urlEntry(`${origin}/`, { lastmod: today, changefreq: 'daily', priority: '1.0' }),
  ];

  for (const slug of Object.keys(CONTENT_PAGES)) {
    urls.push(urlEntry(`${origin}/${slug}`, { changefreq: 'monthly', priority: '0.5' }));
  }

  try {
    const categories = await pool.query(
      `SELECT slug, COALESCE(updated_date, created_date) AS lastmod
       FROM categories
       WHERE active = true AND slug IS NOT NULL AND slug <> ''
       ORDER BY sort_order ASC, name ASC
       LIMIT 500`
    );
    for (const row of categories.rows) {
      urls.push(urlEntry(`${origin}/categoria/${row.slug}`, {
        lastmod: toIsoDate(row.lastmod),
        changefreq: 'weekly',
        priority: '0.8',
      }));
    }
  } catch (err) {
    console.warn('[SEO] Falha ao listar categorias no sitemap:', err.message);
  }

  try {
    const products = await pool.query(
      `SELECT id, COALESCE(updated_date, created_date) AS lastmod
       FROM products
       ORDER BY created_date DESC
       LIMIT 5000`
    );
    for (const row of products.rows) {
      urls.push(urlEntry(`${origin}/produto/${row.id}`, {
        lastmod: toIsoDate(row.lastmod),
        changefreq: 'weekly',
        priority: '0.7',
      }));
    }
  } catch (err) {
    console.warn('[SEO] Falha ao listar produtos no sitemap:', err.message);
  }

  try {
    const kits = await pool.query(
      `SELECT id, COALESCE(updated_date, created_date) AS lastmod
       FROM product_kits
       WHERE active = true
       ORDER BY created_date DESC
       LIMIT 1000`
    );
    for (const row of kits.rows) {
      urls.push(urlEntry(`${origin}/kit/${row.id}`, {
        lastmod: toIsoDate(row.lastmod),
        changefreq: 'weekly',
        priority: '0.6',
      }));
    }
  } catch (err) {
    console.warn('[SEO] Falha ao listar kits no sitemap:', err.message);
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(xml);
});

export default router;
