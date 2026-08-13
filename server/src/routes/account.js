import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { rowToEntity, rowsToEntities } from '../utils/helpers.js';
import {
  normalizeDocument,
  normalizeZipCode,
  profileIncompleteMessage,
} from '../utils/userProfile.js';
import { hydrateUserAddress, composeProfileAddress } from '../utils/address.js';
import { enrichCustomerFromLastOrder } from '../utils/enrichCustomerFromOrder.js';

const router = Router();

const RMA_REASONS = ['defeito', 'produto_errado', 'arrependimento', 'outro'];

router.use(requireAuth);

router.get('/profile', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, role, full_name, phone, document, address, address_street, address_district, address_city, zip_code, created_date, updated_date
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const profile = hydrateUserAddress(rowToEntity(result.rows[0]));
    const lastOrderResult = await pool.query(
      `SELECT customer_name, customer_phone, customer_address, notes
       FROM orders
       WHERE LOWER(customer_email) = LOWER($1)
       ORDER BY created_date DESC
       LIMIT 1`,
      [profile.email]
    );

    const enriched = hydrateUserAddress(
      enrichCustomerFromLastOrder(profile, lastOrderResult.rows[0] || null)
    );
    res.json(enriched);
  } catch (err) {
    console.error('Erro ao buscar perfil:', err);
    res.status(500).json({ message: 'Erro ao carregar perfil' });
  }
});

router.patch('/profile', async (req, res) => {
  try {
    const { full_name, phone, document, address, address_street, address_district, address_city, zip_code } = req.body;

    const current = await pool.query(
      `SELECT id, email, full_name, phone, document, address, address_street, address_district, address_city, zip_code
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const currentRow = hydrateUserAddress(current.rows[0]);
    const street = address_street !== undefined ? String(address_street).trim() : currentRow.address_street;
    const district = address_district !== undefined ? String(address_district).trim() : currentRow.address_district;
    const city = address_city !== undefined ? String(address_city).trim() : currentRow.address_city;
    const composedAddress = composeProfileAddress({ street, district, city })
      || (address !== undefined ? String(address).trim() : currentRow.address);

    const next = {
      email: currentRow.email,
      full_name: full_name !== undefined ? String(full_name).trim() : currentRow.full_name,
      phone: phone !== undefined ? String(phone).trim() : currentRow.phone,
      document: document !== undefined ? normalizeDocument(document) : currentRow.document,
      address: composedAddress,
      address_street: street,
      address_district: district,
      address_city: city,
      zip_code: zip_code !== undefined ? normalizeZipCode(zip_code) : currentRow.zip_code,
    };

    const incomplete = profileIncompleteMessage(next);
    if (incomplete) {
      return res.status(400).json({ message: incomplete });
    }

    const result = await pool.query(
      `UPDATE users SET
        full_name = $1,
        phone = $2,
        document = $3,
        address = $4,
        address_street = $5,
        address_district = $6,
        address_city = $7,
        zip_code = $8,
        updated_date = NOW()
      WHERE id = $9
      RETURNING id, email, role, full_name, phone, document, address, address_street, address_district, address_city, zip_code, created_date, updated_date`,
      [
        next.full_name,
        next.phone,
        next.document,
        next.address,
        next.address_street || null,
        next.address_district || null,
        next.address_city || null,
        next.zip_code,
        req.user.id,
      ]
    );
    res.json(hydrateUserAddress(rowToEntity(result.rows[0])));
  } catch (err) {
    console.error('Erro ao atualizar perfil:', err);
    res.status(500).json({ message: 'Erro ao salvar dados pessoais' });
  }
});

router.get('/wishlist', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT w.id, w.product_id, w.created_date,
              p.name AS product_name, p.price, p.original_price, p.image_url, p.in_stock, p.quantity, p.category
       FROM wishlist_items w
       JOIN products p ON p.id = w.product_id
       WHERE w.user_id = $1
       ORDER BY w.created_date DESC`,
      [req.user.id]
    );
    res.json(rowsToEntities(result.rows));
  } catch (err) {
    console.error('Erro ao listar wishlist:', err);
    res.status(500).json({ message: 'Erro ao carregar lista de desejos' });
  }
});

router.post('/wishlist', async (req, res) => {
  try {
    const { product_id: productId } = req.body;
    if (!productId) {
      return res.status(400).json({ message: 'Produto inválido' });
    }

    const product = await pool.query('SELECT id FROM products WHERE id = $1', [productId]);
    if (product.rows.length === 0) {
      return res.status(404).json({ message: 'Produto não encontrado' });
    }

    await pool.query(
      `INSERT INTO wishlist_items (user_id, product_id) VALUES ($1, $2)
       ON CONFLICT (user_id, product_id) DO NOTHING`,
      [req.user.id, productId]
    );

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Erro ao adicionar à wishlist:', err);
    res.status(500).json({ message: 'Erro ao salvar na lista de desejos' });
  }
});

router.delete('/wishlist/:productId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2',
      [req.user.id, req.params.productId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Erro ao remover da lista de desejos' });
  }
});

router.get('/rma', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, o.total AS order_total, o.created_date AS order_date
       FROM rma_requests r
       LEFT JOIN orders o ON o.id = r.order_id
       WHERE r.user_id = $1
       ORDER BY r.created_date DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(rowsToEntities(result.rows));
  } catch (err) {
    console.error('Erro ao listar RMA:', err);
    res.status(500).json({ message: 'Erro ao carregar solicitações de devolução' });
  }
});

router.post('/rma', async (req, res) => {
  try {
    const { order_id: orderId, reason, description } = req.body;

    if (!orderId || !reason?.trim()) {
      return res.status(400).json({ message: 'Pedido e motivo são obrigatórios' });
    }

    if (!RMA_REASONS.includes(reason)) {
      return res.status(400).json({ message: 'Motivo inválido' });
    }

    const order = await pool.query(
      `SELECT id FROM orders
       WHERE id = $1 AND LOWER(customer_email) = LOWER($2) AND payment_status = 'pago'`,
      [orderId, req.user.email]
    );

    if (order.rows.length === 0) {
      return res.status(400).json({ message: 'Pedido não encontrado ou não elegível para devolução' });
    }

    const existing = await pool.query(
      `SELECT id FROM rma_requests
       WHERE user_id = $1 AND order_id = $2 AND status NOT IN ('recusada', 'concluida')`,
      [req.user.id, orderId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Já existe uma solicitação aberta para este pedido' });
    }

    const result = await pool.query(
      `INSERT INTO rma_requests (user_id, order_id, reason, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, orderId, reason, description?.trim() || null]
    );

    res.status(201).json(rowToEntity(result.rows[0]));
  } catch (err) {
    console.error('Erro ao criar RMA:', err);
    res.status(500).json({ message: 'Erro ao registrar solicitação de devolução' });
  }
});

export default router;
