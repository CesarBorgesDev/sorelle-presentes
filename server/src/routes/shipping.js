import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  getCorreiosConfig,
  buildPackageFromProducts,
  quoteCorreiosShipping,
  fetchAddressByCep,
} from '../services/correios.js';

const router = Router();

async function loadCartProducts(userId) {
  const result = await pool.query(
    `SELECT ci.quantity, p.weight_kg, p.length_cm, p.width_cm, p.height_cm
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1`,
    [userId]
  );
  return result.rows;
}

router.post('/cotacao', requireAuth, async (req, res) => {
  try {
    const { destination_zip } = req.body;
    const config = await getCorreiosConfig();
    const cartProducts = await loadCartProducts(req.user.id);

    if (cartProducts.length === 0) {
      return res.status(400).json({ message: 'Carrinho vazio' });
    }

    const packageInfo = buildPackageFromProducts(cartProducts, config);
    const quote = await quoteCorreiosShipping({
      destinationZip: destination_zip,
      packageInfo,
      config,
    });

    res.json(quote);
  } catch (err) {
    console.error('Erro ao cotar frete:', err);
    res.status(400).json({ message: err.message || 'Erro ao calcular frete' });
  }
});

router.get('/cep/:cep', requireAuth, async (req, res) => {
  try {
    const address = await fetchAddressByCep(req.params.cep);
    res.json(address);
  } catch (err) {
    res.status(400).json({ message: err.message || 'CEP inválido' });
  }
});

export default router;
