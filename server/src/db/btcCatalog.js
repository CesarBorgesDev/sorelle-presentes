import { BTC_SOURCE_SITE } from './btcProductRefs.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeProductName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function readSpec(vtexProduct, key) {
  const value = vtexProduct[key];
  if (Array.isArray(value) && value.length > 0) {
    return String(value[0]).trim();
  }
  return null;
}

export async function fetchBtcProduct(slug) {
  const url = `${BTC_SOURCE_SITE}/api/catalog_system/pub/products/search/${encodeURIComponent(slug)}/p`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ao buscar ${slug}`);
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Produto não encontrado: ${slug}`);
  }

  return data[0];
}

export function mapBtcProduct(vtexProduct, meta) {
  const item = vtexProduct.items?.[0];
  const offer = item?.sellers?.[0]?.commertialOffer;
  const slug = vtexProduct.linkText;
  const referenceUrl = `${BTC_SOURCE_SITE}/${slug}/p`;
  const summary = item?.complementName || vtexProduct.description || '';
  const description = [
    summary.trim(),
    '',
    `Referência de catálogo: ${referenceUrl}`,
    'Produto inspirado no portfólio BTC Home Decor para demonstração da loja Sorelle.',
  ].filter(Boolean).join('\n');

  const price = Number(offer?.Price ?? 0);
  const listPrice = Number(offer?.ListPrice ?? price);
  const images = (item?.images || [])
    .map((image) => image.imageUrl)
    .filter(Boolean);

  return {
    name: normalizeProductName(vtexProduct.productName),
    description,
    price,
    original_price: listPrice > price ? listPrice : null,
    category: meta.category,
    subcategory: meta.subcategory,
    image_url: images[0] || null,
    images,
    featured: meta.featured ?? false,
    in_stock: (offer?.AvailableQuantity ?? 0) > 0,
    sku: (vtexProduct.productReference || vtexProduct.productReferenceCode || slug).toUpperCase(),
    materials: readSpec(vtexProduct, 'Material'),
    dimensions: readSpec(vtexProduct, 'Dimensão (cm)'),
    reference_url: referenceUrl,
  };
}

export async function loadBtcCatalog(refs, { delayMs = 250 } = {}) {
  const products = [];
  const errors = [];

  for (const ref of refs) {
    try {
      const vtexProduct = await fetchBtcProduct(ref.slug);
      products.push(mapBtcProduct(vtexProduct, ref));
    } catch (err) {
      errors.push({ slug: ref.slug, message: err.message });
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return { products, errors };
}

export async function upsertProduct(pool, product) {
  const existing = await pool.query('SELECT id FROM products WHERE sku = $1', [product.sku]);

  const values = [
    product.name,
    product.description,
    product.price,
    product.original_price,
    product.category,
    product.subcategory,
    product.image_url,
    JSON.stringify(product.images || []),
    product.featured,
    product.in_stock,
    product.sku,
    product.materials,
    product.dimensions,
  ];

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE products
       SET name = $1,
           description = $2,
           price = $3,
           original_price = $4,
           category = $5,
           subcategory = $6,
           image_url = $7,
           images = $8::jsonb,
           featured = $9,
           in_stock = $10,
           materials = $11,
           dimensions = $12,
           updated_date = NOW()
       WHERE sku = $13`,
      [...values, product.sku]
    );
    return 'updated';
  }

  await pool.query(
    `INSERT INTO products (
       name, description, price, original_price, category, subcategory,
       image_url, images, featured, in_stock, sku, materials, dimensions
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13)`,
    values
  );
  return 'inserted';
}
