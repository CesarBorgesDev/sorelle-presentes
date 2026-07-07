import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { BTC_PRODUCT_REFS } from './btcProductRefs.js';
import { loadBtcCatalog, upsertProduct } from './btcCatalog.js';

dotenv.config();

const modulePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === modulePath
  : false;

export async function seedBtcProducts(options = {}) {
  const refs = options.refs || BTC_PRODUCT_REFS;
  const clearExisting = options.clearExisting ?? process.env.SEED_BTC_CLEAR === '1';

  console.log(`Carregando ${refs.length} produtos de referência em https://www.btcdecor.com.br/ ...`);

  if (clearExisting) {
    await pool.query('DELETE FROM cart_items');
    await pool.query('DELETE FROM wishlist_items');
    await pool.query('DELETE FROM products');
    console.log('Catálogo anterior removido.');
  }

  const { products, errors } = await loadBtcCatalog(refs);

  let inserted = 0;
  let updated = 0;

  for (const product of products) {
    const result = await upsertProduct(pool, product);
    if (result === 'inserted') {
      inserted += 1;
      console.log(`+ ${product.sku} — ${product.name}`);
    } else {
      updated += 1;
      console.log(`↻ ${product.sku} — ${product.name}`);
    }
  }

  if (errors.length > 0) {
    console.warn('\nAlguns produtos não puderam ser importados:');
    for (const err of errors) {
      console.warn(`  - ${err.slug}: ${err.message}`);
    }
  }

  console.log(`\nSeed BTC concluído: ${inserted} inseridos, ${updated} atualizados, ${errors.length} falhas.`);

  return { inserted, updated, errors, total: products.length };
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@sorelle.com.br';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const existingAdmin = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
  if (existingAdmin.rows.length === 0) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await pool.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
      [adminEmail, passwordHash, 'admin']
    );
    console.log(`Admin criado: ${adminEmail}`);
  }

  try {
    await seedBtcProducts();
  } finally {
    await pool.end();
  }
}

if (isDirectRun) {
  main().catch((err) => {
    console.error('Erro no seed BTC:', err.message);
    process.exit(1);
  });
}
