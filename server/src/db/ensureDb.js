import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function ensureDatabase() {
  if (!config.databaseUrl) {
    throw new Error(
      'DATABASE_URL não configurada. Copie server/.env.example para server/.env.'
    );
  }

  const url = new URL(config.databaseUrl);
  const dbName = url.pathname.slice(1);
  url.pathname = '/postgres';

  const client = new pg.Client({ connectionString: url.toString() });

  try {
    await client.connect();
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rows.length === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Banco "${dbName}" criado.`);
    }
  } finally {
    await client.end();
  }
}

const isDirectRun = process.argv[1]
  && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isDirectRun) {
  ensureDatabase()
    .then(() => console.log('Banco verificado com sucesso.'))
    .catch((err) => {
      console.error('Erro ao garantir banco de dados:', err.message);
      process.exit(1);
    });
}
