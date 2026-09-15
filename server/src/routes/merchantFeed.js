import { Router } from 'express';
import pool from '../config/db.js';
import { config } from '../config/env.js';
import {
  getDefaultVariantSelection,
  getVariantImages,
  resolveVariantAvailability,
  resolveVariantPrice,
} from '../utils/productVariants.js';

const router = Router();
const SITE_NAME = 'Sorelle Presentes';
const MAX_TITLE = 150;
const MAX_DESCRIPTION = 5000;
const MAX_ADDITIONAL_IMAGES = 9;

function siteOrigin() {
  const fromEnv = (config.frontendUrl || config.appPublicUrl || '').replace(/\/$/, '');
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

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value, max) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function toAbsoluteImage(url, origin) {
  const trimmed = String(url || '').trim();
  if (!trimmed || trimmed.startsWith('data:')) return '';
  if (trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('http://')) return trimmed.replace(/^http:\/\//, 'https://');
  if (trimmed.startsWith('/')) return `${origin}${trimmed}`;
  return '';
}

function formatPrice(value) {
  return `${Number(value).toFixed(2)} BRL`;
}

function productType(row) {
  return [row.category_name || row.category, row.subcategory]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' > ');
}

function gTag(name, value) {
  if (value == null || value === '') return '';
  return `      <g:${name}>${xmlEscape(value)}</g:${name}>`;
}

function buildItem(product, origin) {
  const { colorId, size } = getDefaultVariantSelection(product);
  const availability = resolveVariantAvailability(product, colorId, size);
  const pricing = resolveVariantPrice(product, colorId, size);
  const currentPrice = Number(pricing.price || product.price || 0);
  const compareAt = Number(pricing.original_price || 0);
  const images = getVariantImages(product, colorId, size)
    .map((url) => toAbsoluteImage(url, origin))
    .filter(Boolean);

  if (!availability.available || currentPrice <= 0 || !images[0]) return null;

  const description = truncate(
    stripHtml(product.description || product.product_specifications || `Compre ${product.name} na ${SITE_NAME}.`),
    MAX_DESCRIPTION
  );
  const mpn = String(product.internal_code || product.sku || product.id).trim();
  const onSale = compareAt > currentPrice;
  const lines = [
    '    <item>',
    gTag('id', product.id),
    gTag('title', truncate(product.name, MAX_TITLE)),
    gTag('description', description || truncate(product.name, MAX_DESCRIPTION)),
    gTag('link', `${origin}/produto/${product.id}`),
    gTag('image_link', images[0]),
    ...images.slice(1, 1 + MAX_ADDITIONAL_IMAGES).map((url) => gTag('additional_image_link', url)),
    gTag('availability', 'in_stock'),
    gTag('price', formatPrice(onSale ? compareAt : currentPrice)),
    onSale ? gTag('sale_price', formatPrice(currentPrice)) : '',
    gTag('condition', 'new'),
    gTag('brand', SITE_NAME),
    gTag('mpn', mpn),
    gTag('identifier_exists', 'no'),
    gTag('product_type', productType(product)),
    gTag('adult', 'no'),
    '    </item>',
  ].filter(Boolean);

  return lines.join('\n');
}

router.get('/feeds/google-merchant.xml', async (_req, res) => {
  const origin = siteOrigin();
  let items = [];

  try {
    const result = await pool.query(
      `SELECT
         p.id, p.name, p.description, p.product_specifications, p.price, p.original_price,
         p.category, p.subcategory, p.image_url, p.images, p.in_stock, p.quantity,
         p.internal_code, p.sku, p.variants,
         c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.slug = p.category
       WHERE p.in_stock = true AND COALESCE(p.quantity, 0) > 0
       ORDER BY p.updated_date DESC NULLS LAST, p.created_date DESC
       LIMIT 5000`
    );
    items = result.rows.map((row) => buildItem(row, origin)).filter(Boolean);
  } catch (err) {
    console.warn('[Merchant Feed] Falha ao listar produtos:', err.message);
    res.status(500).type('application/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Erro</title></channel></rss>'
    );
    return;
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '  <channel>',
    `    <title>${xmlEscape(SITE_NAME)}</title>`,
    `    <link>${xmlEscape(origin)}/</link>`,
    `    <description>${xmlEscape('Catálogo de produtos da Sorelle Presentes')}</description>`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(xml);
});

export default router;
