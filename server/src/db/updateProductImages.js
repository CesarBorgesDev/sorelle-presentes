import dotenv from 'dotenv';
import pool from '../config/db.js';
import { syncProductImages } from './productImages.js';

dotenv.config();

syncProductImages(pool)
  .then(() => {
    console.log('Fotos dos produtos atualizadas.');
    return pool.end();
  })
  .catch((err) => {
    console.error('Erro ao atualizar imagens:', err.message);
    process.exit(1);
  });
