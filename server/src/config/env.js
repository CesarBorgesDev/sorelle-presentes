import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '../../.env') });

function readInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '0.0.0.0',
  port: readInt(process.env.PORT, 3001),
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  jwtSecret: process.env.JWT_SECRET?.trim() || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN?.trim() || '',
  frontendUrl: process.env.FRONTEND_URL?.trim() || '',
  appPublicUrl: process.env.APP_PUBLIC_URL?.trim() || '',
  domain: process.env.DOMAIN?.trim() || 'sorellepresentes.com.br',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
};

export function assertDatabaseConfig() {
  if (!config.databaseUrl) {
    throw new Error(
      'DATABASE_URL não configurada. Copie server/.env.example para server/.env.'
    );
  }
}

export function assertRequiredConfig() {
  assertDatabaseConfig();

  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET não configurado em server/.env.');
  }

  if (config.isProduction && config.jwtSecret.length < 24) {
    throw new Error('JWT_SECRET muito curto para produção (mínimo 24 caracteres).');
  }
}
