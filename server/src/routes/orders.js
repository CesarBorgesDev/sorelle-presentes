import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { parseSort, rowToEntity, rowsToEntities } from '../utils/helpers.js';

const router = Router();

const ALLOWED_FIELDS = [
  'customer_name', 'customer_email', 'customer_phone', 'customer_address',
  'items', 'subtotal', 'wrapping_cost', 'shipping_cost', 'shipping_service_code',
  'shipping_service_name', 'shipping_deadline_days', 'total', 'status', 'payment_method',
  'payment_status', 'gateway_order_number', 'notes',
];

router.use(requireAuth, requireAdmin);

router.get('/', async (req, res) => {
  try {
    const { sort = '-created_date', limit = '100' } = req.query;
    const { column, direction } = parseSort(sort);
    const result = await pool.query(
      `SELECT * FROM orders ORDER BY ${column} ${direction} LIMIT $1`,
      [parseInt(limit) || 100]
    );
    res.json(rowsToEntities(result.rows));
  } catch (err) {
    res.status(500).json({ message: 'Erro ao listar pedidos' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Pedido não encontrado' });
    }
    res.json(rowToEntity(result.rows[0]));
  } catch (err) {
    res.status(500).json({ message: 'Erro ao buscar pedido' });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const result = await pool.query(
      `INSERT INTO orders (customer_name, customer_email, customer_phone, customer_address, items, subtotal, wrapping_cost, total, status, payment_method, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        data.customer_name, data.customer_email, data.customer_phone || null,
        data.customer_address || null, JSON.stringify(data.items || []),
        data.subtotal || 0, data.wrapping_cost || 0, data.total,
        data.status || 'pendente', data.payment_method || null, data.notes || null,
      ]
    );
    res.status(201).json(rowToEntity(result.rows[0]));
  } catch (err) {
    console.error('Erro ao criar pedido:', err);
    res.status(500).json({ message: 'Erro ao criar pedido' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const data = req.body;
    const sets = [];
    const values = [];
    let idx = 1;

    for (const field of ALLOWED_FIELDS) {
      if (data[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        values.push(field === 'items' ? JSON.stringify(data[field]) : data[field]);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ message: 'Nenhum campo para atualizar' });
    }

    sets.push('updated_date = NOW()');
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE orders SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Pedido não encontrado' });
    }
    res.json(rowToEntity(result.rows[0]));
  } catch (err) {
    res.status(500).json({ message: 'Erro ao atualizar pedido' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM orders WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Pedido não encontrado' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Erro ao excluir pedido' });
  }
});

export default router;
