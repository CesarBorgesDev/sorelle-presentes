import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { parseSort, rowToEntity, rowsToEntities } from '../utils/helpers.js';
import { generateCorreiosShippingLabel } from '../services/shippingLabels.js';
import { normalizeTrackingCode, trackCorreiosPackage } from '../services/correiosTracking.js';
import { generateCorreiosTrackingCode } from '../services/correiosPrePostagem.js';
import { getInvoiceTypeConfig, saveInvoiceFile } from '../services/invoiceUpload.js';
import { streamOrderInvoice, withInvoiceFlags, withInvoiceFlagsList } from '../services/invoiceAccess.js';

const router = Router();

const ALLOWED_FIELDS = [
  'customer_name', 'customer_email', 'customer_phone', 'customer_address',
  'items', 'subtotal', 'wrapping_cost', 'shipping_cost', 'shipping_service_code',
  'shipping_service_name', 'shipping_deadline_days', 'total', 'status', 'payment_method',
  'payment_status', 'gateway_order_number', 'notes', 'tracking_code', 'shipping_label_url',
  'shipped_at', 'cielo_authorization_code', 'cielo_payment_id',
];

router.use(requireAuth, requireAdmin);

async function loadOrderOr404(id, res) {
  const result = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    res.status(404).json({ message: 'Pedido não encontrado' });
    return null;
  }
  return rowToEntity(result.rows[0]);
}

router.get('/', async (req, res) => {
  try {
    const { sort = '-created_date', limit = '100' } = req.query;
    const { column, direction } = parseSort(sort);
    const result = await pool.query(
      `SELECT * FROM orders ORDER BY ${column} ${direction} LIMIT $1`,
      [parseInt(limit) || 100]
    );
    res.json(withInvoiceFlagsList(rowsToEntities(result.rows)));
  } catch (err) {
    res.status(500).json({ message: 'Erro ao listar pedidos' });
  }
});

router.post('/:id/etiqueta', async (req, res) => {
  try {
    const order = await loadOrderOr404(req.params.id, res);
    if (!order) return;

    const trackingCode = normalizeTrackingCode(req.body?.tracking_code || order.tracking_code);
    const label = await generateCorreiosShippingLabel(order, { trackingCode });

    const result = await pool.query(
      `UPDATE orders
       SET shipping_label_url = $1,
           tracking_code = COALESCE($2, tracking_code),
           status = CASE WHEN $2 IS NOT NULL AND status IN ('confirmado', 'em_preparo') THEN 'enviado' ELSE status END,
           shipped_at = CASE WHEN $2 IS NOT NULL THEN COALESCE(shipped_at, NOW()) ELSE shipped_at END,
           updated_date = NOW()
       WHERE id = $3
       RETURNING *`,
      [label.label_url, label.tracking_code, order.id]
    );

    res.json({
      message: 'Etiqueta gerada com sucesso',
      label_url: label.label_url,
      tracking_code: result.rows[0]?.tracking_code || null,
      order: rowToEntity(result.rows[0]),
    });
  } catch (err) {
    console.error('Erro ao gerar etiqueta:', err);
    res.status(500).json({ message: err.message || 'Erro ao gerar etiqueta' });
  }
});

router.post('/:id/codigo-correios', async (req, res) => {
  try {
    const order = await loadOrderOr404(req.params.id, res);
    if (!order) return;

    const generated = await generateCorreiosTrackingCode(order);
    const label = await generateCorreiosShippingLabel(order, {
      trackingCode: generated.tracking_code,
    });

    const result = await pool.query(
      `UPDATE orders
       SET tracking_code = $1,
           shipping_label_url = $2,
           status = CASE WHEN status IN ('confirmado', 'em_preparo', 'pendente') THEN 'enviado' ELSE status END,
           shipped_at = COALESCE(shipped_at, NOW()),
           updated_date = NOW()
       WHERE id = $3
       RETURNING *`,
      [generated.tracking_code, label.label_url, order.id]
    );

    res.json({
      message: 'Código de rastreio gerado com sucesso',
      tracking_code: generated.tracking_code,
      prepostagem_id: generated.prepostagem_id,
      label_url: label.label_url,
      order: withInvoiceFlags(rowToEntity(result.rows[0])),
    });
  } catch (err) {
    console.error('Erro ao gerar código Correios:', err);
    res.status(400).json({ message: err.message || 'Erro ao gerar código Correios' });
  }
});

router.post('/:id/nota-fiscal', async (req, res) => {
  try {
    const order = await loadOrderOr404(req.params.id, res);
    if (!order) return;

    const type = String(req.body?.type || '').toLowerCase();
    const config = getInvoiceTypeConfig(type);
    if (!config) {
      return res.status(400).json({ message: 'Informe type como pdf ou xml' });
    }

    const saved = saveInvoiceFile({
      orderId: order.id,
      type,
      file: req.body?.file,
      mimeTypeHint: req.body?.mime_type,
    });

    const result = await pool.query(
      `UPDATE orders SET ${config.column} = $1, updated_date = NOW() WHERE id = $2 RETURNING *`,
      [saved.storage_path, order.id]
    );

    res.json({
      message: `Nota fiscal ${config.label} anexada com sucesso`,
      type,
      order: withInvoiceFlags(rowToEntity(result.rows[0])),
    });
  } catch (err) {
    console.error('Erro ao anexar nota fiscal:', err);
    res.status(400).json({ message: err.message || 'Erro ao anexar nota fiscal' });
  }
});

router.get('/:id/nota-fiscal/:type', async (req, res) => {
  try {
    const order = await loadOrderOr404(req.params.id, res);
    if (!order) return;

    streamOrderInvoice({
      order,
      type: req.params.type,
      res,
      downloadName: `nota-fiscal-${order.id}.${req.params.type}`,
    });
  } catch (err) {
    console.error('Erro ao baixar nota fiscal:', err);
    res.status(500).json({ message: 'Erro ao baixar nota fiscal' });
  }
});

router.get('/:id/rastreio', async (req, res) => {
  try {
    const order = await loadOrderOr404(req.params.id, res);
    if (!order) return;

    if (!order.tracking_code) {
      return res.status(400).json({ message: 'Pedido ainda não possui código de rastreio' });
    }

    const tracking = await trackCorreiosPackage(order.tracking_code);
    res.json({
      order_id: order.id,
      order_status: order.status,
      payment_status: order.payment_status,
      ...tracking,
    });
  } catch (err) {
    console.error('Erro ao rastrear pedido:', err);
    res.status(500).json({ message: err.message || 'Erro ao rastrear pedido' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const order = await loadOrderOr404(req.params.id, res);
    if (!order) return;
    res.json(withInvoiceFlags(order));
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
    const data = { ...req.body };

    if (data.tracking_code !== undefined) {
      data.tracking_code = normalizeTrackingCode(data.tracking_code) || null;
      if (data.tracking_code && !data.status) {
        data.status = 'enviado';
      }
      if (data.tracking_code && !data.shipped_at) {
        data.shipped_at = new Date().toISOString();
      }
    }

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
