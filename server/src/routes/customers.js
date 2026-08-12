import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { rowToEntity, rowsToEntities } from '../utils/helpers.js';
import { enrichCustomerFromLastOrder } from '../utils/enrichCustomerFromOrder.js';

const router = Router();

router.use(requireAuth, requireAdmin);

function formatDocument(doc) {
  const digits = String(doc || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return doc || null;
}

function toCustomer(row) {
  const entity = rowToEntity(row);
  const {
    google_id,
    last_order_customer_name,
    last_order_customer_phone,
    last_order_customer_address,
    last_order_notes,
    ...rest
  } = entity;

  const base = {
    ...rest,
    has_google: Boolean(google_id),
    orders_count: Number(rest.orders_count) || 0,
    orders_paid_count: Number(rest.orders_paid_count) || 0,
    orders_total: Number(rest.orders_total) || 0,
    last_order_date: rest.last_order_date || null,
  };

  const enriched = enrichCustomerFromLastOrder(base, {
    customer_name: last_order_customer_name,
    customer_phone: last_order_customer_phone,
    customer_address: last_order_customer_address,
    notes: last_order_notes,
  });

  return {
    ...enriched,
    document_formatted: formatDocument(enriched.document),
  };
}

const LAST_ORDER_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS orders_count,
      COUNT(*) FILTER (WHERE o.payment_status = 'pago')::int AS orders_paid_count,
      COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'pago'), 0)::float AS orders_total,
      MAX(o.created_date) AS last_order_date
    FROM orders o
    WHERE LOWER(o.customer_email) = LOWER(u.email)
  ) os ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      o.customer_name AS last_order_customer_name,
      o.customer_phone AS last_order_customer_phone,
      o.customer_address AS last_order_customer_address,
      o.notes AS last_order_notes
    FROM orders o
    WHERE LOWER(o.customer_email) = LOWER(u.email)
    ORDER BY o.created_date DESC
    LIMIT 1
  ) lo ON TRUE
`;

router.get('/', async (req, res) => {
  try {
    const { sort = '-created_date', limit = '200', q = '' } = req.query;
    const search = String(q || '').trim();
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);

    const allowedSort = {
      created_date: 'u.created_date',
      full_name: 'u.full_name',
      email: 'u.email',
      orders_count: 'orders_count',
      orders_total: 'orders_total',
      last_order_date: 'last_order_date',
    };
    const desc = String(sort).startsWith('-');
    const sortKey = desc ? String(sort).slice(1) : String(sort);
    const sortColumn = allowedSort[sortKey] || 'u.created_date';
    const direction = desc ? 'DESC' : 'ASC';

    const params = [];
    let searchSql = '';
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      const p = `$${params.length}`;
      searchSql = `AND (
        LOWER(u.email) LIKE ${p}
        OR LOWER(COALESCE(u.full_name, '')) LIKE ${p}
        OR LOWER(COALESCE(u.phone, '')) LIKE ${p}
        OR LOWER(COALESCE(u.document, '')) LIKE ${p}
        OR LOWER(COALESCE(u.address, '')) LIKE ${p}
        OR LOWER(COALESCE(u.zip_code, '')) LIKE ${p}
      )`;
    }

    params.push(limitNum);
    const limitParam = `$${params.length}`;

    const result = await pool.query(
      `SELECT
         u.id,
         u.email,
         u.full_name,
         u.phone,
         u.document,
         u.address,
         u.zip_code,
         u.google_id,
         u.created_date,
         u.updated_date,
         COALESCE(os.orders_count, 0)::int AS orders_count,
         COALESCE(os.orders_paid_count, 0)::int AS orders_paid_count,
         COALESCE(os.orders_total, 0)::float AS orders_total,
         os.last_order_date,
         lo.last_order_customer_name,
         lo.last_order_customer_phone,
         lo.last_order_customer_address,
         lo.last_order_notes
       FROM users u
       ${LAST_ORDER_LATERAL}
       WHERE u.role = 'user'
       ${searchSql}
       ORDER BY ${sortColumn} ${direction} NULLS LAST
       LIMIT ${limitParam}`,
      params
    );

    res.json(result.rows.map(toCustomer));
  } catch (err) {
    console.error('Erro ao listar clientes:', err);
    res.status(500).json({ message: 'Erro ao listar clientes' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.email,
         u.full_name,
         u.phone,
         u.document,
         u.address,
         u.zip_code,
         u.google_id,
         u.created_date,
         u.updated_date,
         COALESCE(os.orders_count, 0)::int AS orders_count,
         COALESCE(os.orders_paid_count, 0)::int AS orders_paid_count,
         COALESCE(os.orders_total, 0)::float AS orders_total,
         os.last_order_date,
         lo.last_order_customer_name,
         lo.last_order_customer_phone,
         lo.last_order_customer_address,
         lo.last_order_notes
       FROM users u
       ${LAST_ORDER_LATERAL}
       WHERE u.id = $1 AND u.role = 'user'`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    const customer = toCustomer(result.rows[0]);

    const ordersResult = await pool.query(
      `SELECT id, status, payment_status, payment_method, total, subtotal, discount_amount,
              wrapping_cost, shipping_cost, shipping_service_name, tracking_code, items,
              customer_name, customer_email, customer_phone, customer_address,
              notes, created_date, updated_date, shipped_at
       FROM orders
       WHERE LOWER(customer_email) = LOWER($1)
       ORDER BY created_date DESC
       LIMIT 50`,
      [customer.email]
    );

    res.json({
      ...customer,
      orders: rowsToEntities(ordersResult.rows),
    });
  } catch (err) {
    console.error('Erro ao buscar cliente:', err);
    res.status(500).json({ message: 'Erro ao buscar cliente' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const existing = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'user'`,
      [req.params.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    const { full_name, phone, document, address, zip_code } = req.body;
    if (
      full_name === undefined
      && phone === undefined
      && document === undefined
      && address === undefined
      && zip_code === undefined
    ) {
      return res.status(400).json({ message: 'Nenhum dado para atualizar' });
    }

    const sets = [];
    const values = [];
    const push = (col, value) => {
      values.push(value);
      sets.push(`${col} = $${values.length}`);
    };

    if (full_name !== undefined) push('full_name', String(full_name).trim() || null);
    if (phone !== undefined) push('phone', String(phone).trim() || null);
    if (document !== undefined) {
      push('document', String(document).replace(/\D/g, '').slice(0, 14) || null);
    }
    if (address !== undefined) push('address', String(address).trim() || null);
    if (zip_code !== undefined) {
      push('zip_code', String(zip_code).replace(/\D/g, '').slice(0, 8) || null);
    }

    values.push(req.params.id);
    const updateResult = await pool.query(
      `UPDATE users SET ${sets.join(', ')}, updated_date = NOW()
       WHERE id = $${values.length} AND role = 'user'
       RETURNING id, email, full_name, phone, document, address, zip_code, google_id, created_date, updated_date`,
      values
    );

    res.json(toCustomer(updateResult.rows[0]));
  } catch (err) {
    console.error('Erro ao atualizar cliente:', err);
    res.status(500).json({ message: 'Erro ao atualizar cliente' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.email,
         COALESCE(os.orders_count, 0)::int AS orders_count
       FROM users u
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS orders_count
         FROM orders o
         WHERE LOWER(o.customer_email) = LOWER(u.email)
       ) os ON TRUE
       WHERE u.id = $1 AND u.role = 'user'`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    const customer = result.rows[0];
    if (Number(customer.orders_count) > 0) {
      return res.status(400).json({
        message: 'Não é permitido excluir clientes com vendas ou pedidos registrados',
      });
    }

    await pool.query('DELETE FROM users WHERE id = $1 AND role = \'user\'', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir cliente:', err);
    res.status(500).json({ message: 'Erro ao excluir cliente' });
  }
});

export default router;
