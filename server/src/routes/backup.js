import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import pool from '../config/db.js';
import { createBackupArchive } from '../services/backup.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/', async (_req, res) => {
  let backup = null;
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
      await backup.cleanup();
      if (!res.headersSent) {
        res.status(500).json({ message: 'Erro ao ler arquivo de backup' });
      } else {
        res.destroy(err);
      }
    });
    stream.on('close', async () => {
      await backup.cleanup();
    });
    res.on('close', async () => {
      if (!res.writableEnded) {
        stream.destroy();
        await backup.cleanup();
      }
    });

    stream.pipe(res);
  } catch (err) {
    console.error('[Backup] Falha ao gerar backup:', err.message);
    if (backup) await backup.cleanup();
    if (!res.headersSent) {
      res.status(500).json({
        message: err.message || 'Erro ao gerar backup',
      });
    }
  }
});

export default router;
