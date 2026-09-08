import pool from '../config/db.js';
import { rowToEntity } from '../utils/helpers.js';

const STOPWORDS = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na',
  'para', 'por', 'com', 'sem', 'que', 'qual', 'quais', 'meu', 'minha', 'seu', 'sua',
  'tem', 'ter', 'quero', 'queria', 'gostaria', 'procuro', 'procurando', 'preciso',
  'voces', 'voce', 'vocês', 'me', 'mim', 'isso', 'esse', 'essa', 'este', 'esta',
  'presente', 'presentes', 'produto', 'produtos', 'algo', 'algum', 'alguma',
]);

export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeQuery(value) {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function scoreProduct(product, tokens) {
  const haystack = normalizeText([
    product.name,
    product.description,
    product.category,
    product.subcategory,
    product.materials,
    product.sku,
    product.internal_code,
  ].filter(Boolean).join(' '));

  let score = 0;
  for (const token of tokens) {
    if (normalizeText(product.name).includes(token)) score += 6;
    else if (haystack.includes(token)) score += 2;
  }
  if (product.featured) score += 1;
  if (product.in_stock) score += 1;
  return score;
}

export async function searchProducts({ query = '', category, budgetMax, featured, limit = 5 } = {}) {
  const tokens = tokenizeQuery(query);
  const conditions = ['in_stock = true'];
  const values = [];
  let idx = 1;

  if (category) {
    conditions.push(`category = $${idx++}`);
    values.push(category);
  }
  if (featured) {
    conditions.push('featured = true');
  }
  if (Number.isFinite(budgetMax) && budgetMax > 0) {
    conditions.push(`price <= $${idx++}`);
    values.push(budgetMax);
  }
  if (tokens.length) {
    const likes = tokens.map((token) => {
      const i = idx++;
      values.push(`%${token}%`);
      return `(name ILIKE $${i} OR description ILIKE $${i} OR category ILIKE $${i} OR subcategory ILIKE $${i} OR materials ILIKE $${i})`;
    });
    conditions.push(`(${likes.join(' OR ')})`);
  }

  values.push(Math.min(Math.max(Number(limit) || 5, 1), 20) * 4);
  const result = await pool.query(
    `SELECT * FROM products
     WHERE ${conditions.join(' AND ')}
     ORDER BY featured DESC, created_date DESC
     LIMIT $${idx}`,
    values
  );

  const products = result.rows.map(rowToEntity);
  if (!tokens.length) return products.slice(0, limit);

  return products
    .map((product) => ({ product, score: scoreProduct(product, tokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.product);
}

export async function findProductByMention(text) {
  const tokens = tokenizeQuery(text);
  if (!tokens.length) return null;
  const matches = await searchProducts({ query: text, limit: 1 });
  return matches[0] || null;
}

export async function listFeaturedProducts(limit = 3) {
  const result = await pool.query(
    `SELECT * FROM products
     WHERE in_stock = true
     ORDER BY featured DESC, created_date DESC
     LIMIT $1`,
    [Math.min(Math.max(Number(limit) || 3, 1), 8)]
  );
  return result.rows.map(rowToEntity);
}

export async function getProductById(id) {
  if (!id) return null;
  const result = await pool.query('SELECT * FROM products WHERE id = $1 LIMIT 1', [id]);
  return rowToEntity(result.rows[0]);
}
