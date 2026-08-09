import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import pool from '../config/db.js';
import { createBackupArchive } from '../services/backup.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/', async (_req, res) => {
  let backup = null;
  let cleaned = false;

  const cleanupOnce = async () => {
    if (cleaned || !backup) return;
    cleaned = true;
    await backup.cleanup().catch((err) => {
      console.error('[Backup] Erro ao limpar arquivo temporário:', err.message);
    });
  };

  try {
    backup = await createBackupArchive(pool);

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${backup.filename}"`
    );
    res.setHeader('Cache-Control', 'no-store');

    const stream = backup.createReadStream();

    stream.on('error', async (err) => {
      console.error('[Backup] Erro ao ler arquivo:', err.message);
      if (!stream.destroyed) {
        stream.destroy();
      }
      if (!res.headersSent) {
        await cleanupOnce();
        res.status(500).json({ message: 'Erro ao ler arquivo de backup' });
      } else if (!res.destroyed) {
        // cleanup via res 'close' após abortar a resposta
        res.destroy(err);
      } else {
        await cleanupOnce();
      }
    });

    // Só apaga o arquivo depois que a resposta terminou (ou a conexão caiu).
    // Não usar stream 'close': ele dispara antes do pipe terminar de enviar ao cliente.
    res.on('finish', () => {
      cleanupOnce();
    });
    res.on('close', () => {
      if (!stream.destroyed) {
        stream.destroy();
      }
      cleanupOnce();
    });

    stream.pipe(res);
  } catch (err) {
    console.error('[Backup] Falha ao gerar backup:', err.message);
    await cleanupOnce();
    if (!res.headersSent) {
      res.status(500).json({
        message: err.message || 'Erro ao gerar backup',
      });
    }
  }
});

export default router;
