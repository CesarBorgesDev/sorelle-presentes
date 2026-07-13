import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import {
  getCorreiosConfig,
  buildPackageFromProducts,
  quoteCorreiosShipping,
  fetchAddressByCep,
} from '../services/correios.js';
import { normalizeProductQuantity } from '../utils/productStock.js';
import { getStorePickupConfig, buildStorePickupOption } from '../services/storePickup.js';

const router = Router();

async function loadCartProducts(userId) {
  const result = await pool.query(
    `SELECT ci.quantity, ci.price, p.weight_kg, p.length_cm, p.width_cm, p.height_cm
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1`,
    [userId]
  );
  return result.rows;
}

function calcInvoiceValue(items) {
  return items.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
    0
  );
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
      invoiceValue: calcInvoiceValue(cartProducts),
    });

    const pickupConfig = await getStorePickupConfig();
    const pickupOption = buildStorePickupOption(pickupConfig);
    if (pickupOption) {
      quote.options = [pickupOption, ...quote.options];
    }

    res.json(quote);
  } catch (err) {
    console.error('Erro ao cotar frete:', err);
    res.status(400).json({ message: err.message || 'Erro ao calcular frete' });
  }
});

router.post('/cotacao-produto', optionalAuth, async (req, res) => {
  try {
    const { product_id, quantity = 1, destination_zip } = req.body;
    const config = await getCorreiosConfig();

    if (!product_id) {
      return res.status(400).json({ message: 'Produto não informado' });
    }

    const result = await pool.query(
      `SELECT id, price, weight_kg, length_cm, width_cm, height_cm
       FROM products WHERE id = $1`,
      [product_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Produto não encontrado' });
    }

    const product = result.rows[0];
    const qty = normalizeProductQuantity(quantity) || 1;
    const packageInfo = buildPackageFromProducts([{
      ...product,
      quantity: qty,
    }], config);

    const quote = await quoteCorreiosShipping({
      destinationZip: destination_zip,
      packageInfo,
      config,
      invoiceValue: (Number(product.price) || 0) * qty,
    });

    res.json(quote);
  } catch (err) {
    console.error('Erro ao cotar frete do produto:', err);
    res.status(400).json({ message: err.message || 'Erro ao calcular frete' });
  }
});

router.get('/cep/:cep', optionalAuth, async (req, res) => {
  try {
    const address = await fetchAddressByCep(req.params.cep);
    res.json(address);
  } catch (err) {
    res.status(400).json({ message: err.message || 'CEP inválido' });
  }
});

export default router;
