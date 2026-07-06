import pg from 'pg';
import { config, assertDatabaseConfig } from './env.js';

assertDatabaseConfig();

const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.isProduction ? 20 : 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool PostgreSQL:', err.message);
});

export async function checkDatabaseConnection() {
  await pool.query('SELECT 1 AS ok');
}

export default pool;
