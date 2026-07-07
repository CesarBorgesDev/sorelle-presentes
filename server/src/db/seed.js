import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { seedBtcProducts } from './seedBtcProducts.js';

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
  if (parseInt(productCount.rows[0].count, 10) === 0) {
    await seedBtcProducts({ clearExisting: false });
  } else {
    console.log('Produtos já existem. Para recarregar o catálogo BTC, rode: npm run db:seed-btc');
  }

  console.log('Seed concluído!');
  await pool.end();
}

seed().catch((err) => {
  console.error('Erro no seed:', err.message);
  process.exit(1);
});
