import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { sampleProducts, syncProductImages } from './productImages.js';

async function seed() {
  console.log('Iniciando seed do banco de dados...');

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
  } else {
    console.log('Admin já existe, pulando criação.');
  }

  const productCount = await pool.query('SELECT COUNT(*) FROM products');
  if (parseInt(productCount.rows[0].count) === 0) {
    for (const product of sampleProducts) {
      await pool.query(
        `INSERT INTO products (name, description, price, original_price, category, subcategory, image_url, featured, in_stock, materials, dimensions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          product.name, product.description, product.price, product.original_price || null,
          product.category, product.subcategory, product.image_url, product.featured,
          product.in_stock, product.materials, product.dimensions,
        ]
      );
    }
    console.log(`${sampleProducts.length} produtos de exemplo criados.`);
  } else {
    console.log('Produtos já existem, sincronizando imagens...');
    await syncProductImages(pool);
  }

  console.log('Seed concluído!');
  await pool.end();
}

seed().catch((err) => {
  console.error('Erro no seed:', err.message);
  process.exit(1);
});
