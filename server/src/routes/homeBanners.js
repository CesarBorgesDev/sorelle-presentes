import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getHomeBanners, updateHomeBanners } from '../services/homeBanners.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const banners = await getHomeBanners();
    res.json(banners);
  } catch (err) {
    console.error('Erro ao buscar banners da home:', err);
    res.status(500).json({ message: 'Erro ao carregar banners da home' });
  }
});

router.put('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const banners = await updateHomeBanners(req.body);
    res.json({ message: 'Banners salvos com sucesso', banners });
  } catch (err) {
    console.error('Erro ao salvar banners da home:', err);
    res.status(500).json({ message: 'Erro ao salvar banners da home' });
  }
});

export default router;
