import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { parseSort, rowToEntity, rowsToEntities } from '../utils/helpers.js';
import { generateCorreiosShippingLabel } from '../services/shippingLabels.js';
import { normalizeTrackingCode, trackCorreiosPackage } from '../services/correiosTracking.js';
import {
  buildCorreiosCodePrerequisites,
  generateCorreiosOfficialLabel,
  generateCorreiosTrackingCode,
  isCorreiosPrePostagemOrder,
} from '../services/correiosPrePostagem.js';
import {
  generateMelhorEnvioLabel,
  isMelhorEnvioServiceCode,
} from '../services/melhorEnvio.js';
import { getInvoiceTypeConfig, saveInvoiceFile } from '../services/invoiceUpload.js';
import { streamOrderInvoice, withInvoiceFlags, withInvoiceFlagsList } from '../services/invoiceAccess.js';
import { verifyMercadoPagoOrderPayment } from '../services/mercadoPagoNotifications.js';
import { enrichOrderItems, enrichOrdersItems } from '../utils/enrichOrderItems.js';

const router = Router();

const ALLOWED_FIELDS = [
  'customer_name', 'customer_email', 'customer_phone', 'customer_address',
  'items', 'subtotal', 'wrapping_cost', 'shipping_cost', 'shipping_service_code',
  'shipping_service_name', 'shipping_deadline_days', 'total', 'status', 'payment_method',
  'payment_status', 'gateway_order_number', 'notes', 'tracking_code', 'shipping_label_url',
  'correios_prepostagem_id', 'shipped_at', 'cielo_authorization_code', 'cielo_payment_id',
];

router.use(requireAuth, requireAdmin);

async function loadOrderOr404(id, res) {
  const result = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    res.status(404).json({ message: 'Pedido não encontrado' });
    return null;
  }
  return enrichOrderItems(pool, rowToEntity(result.rows[0]));
}

router.get('/', async (req, res) => {
  try {
    const { sort = '-created_date', limit = '100' } = req.query;
    const { column, direction } = parseSort(sort);
    const result = await pool.query(
      `SELECT * FROM orders ORDER BY ${column} ${direction} LIMIT $1`,
      [parseInt(limit) || 100]
    );
    const orders = await enrichOrdersItems(pool, rowsToEntities(result.rows));
    res.json(withInvoiceFlagsList(orders));
  } catch (err) {
    res.status(500).json({ message: 'Erro ao listar pedidos' });
  }
});

router.get('/stats', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'pendente')::int AS pending,
        COALESCE(SUM(total) FILTER (WHERE status <> 'cancelado'), 0)::float AS revenue
      FROM orders
    `);
    const row = result.rows[0] || { total: 0, pending: 0, revenue: 0 };
    res.json({
      total: row.total || 0,
      pending: row.pending || 0,
      revenue: Number(row.revenue) || 0,
    });
  } catch (err) {
    console.error('Erro ao buscar estatísticas de pedidos:', err);
    res.status(500).json({ message: 'Erro ao buscar estatísticas' });
  }
});

router.post('/:id/etiqueta', async (req, res) => {
  try {
    const order = await loadOrderOr404(req.params.id, res);
    if (!order) return;

    if (isMelhorEnvioServiceCode(order.shipping_service_code)) {
      return res.status(400).json({
        message: 'Este pedido usa Melhor Envio. Use “Gerar etiqueta Melhor Envio”.',
      });
    }

    // PAC/SEDEX: rótulo oficial via Token CWS (reemite se já houver pré-postagem)
    if (isCorreiosPrePostagemOrder(order)) {
      const generated = await generateCorreiosOfficialLabel(order);

      let labelUrl = generated.label_url || null;
      let labelSource = generated.label_source || null;
      let labelError = null;

      if (!labelUrl) {
        try {
          const label = await generateCorreiosShippingLabel(order, {
            trackingCode: generated.tracking_code
              || normalizeTrackingCode(req.body?.tracking_code || order.tracking_code),
          });
          labelUrl = label.label_url;
          labelSource = 'html_local';
        } catch (labelErr) {
          console.error('Etiqueta HTML falhou após rótulo Correios:', labelErr);
          labelError = labelErr.message || 'Falha ao gerar etiqueta HTML local';
        }
      }

      const trackingCode = generated.tracking_code
        || normalizeTrackingCode(req.body?.tracking_code || order.tracking_code)
        || null;

      const result = await pool.query(
        `UPDATE orders
         SET tracking_code = COALESCE($1, tracking_code),
             shipping_label_url = COALESCE($2, shipping_label_url),
             correios_prepostagem_id = COALESCE($3, correios_prepostagem_id),
             status = CASE
               WHEN $1 IS NOT NULL AND status IN ('confirmado', 'em_preparo', 'pendente') THEN 'enviado'
               ELSE status
             END,
             shipped_at = CASE WHEN $1 IS NOT NULL THEN COALESCE(shipped_at, NOW()) ELSE shipped_at END,
             updated_date = NOW()
         WHERE id = $4
         RETURNING *`,
        [trackingCode, labelUrl, generated.prepostagem_id || null, order.id]
      );

      return res.json({
        message: labelError
          ? 'Rótulo solicitado (PDF/HTML falhou)'
          : labelSource === 'correios_pdf'
            ? 'Rótulo oficial dos Correios gerado'
            : trackingCode
              ? 'Código gerado; etiqueta HTML local (PDF oficial indisponível)'
              : 'Etiqueta gerada',
        tracking_code: result.rows[0]?.tracking_code || trackingCode,
        prepostagem_id: generated.prepostagem_id || null,
        id_recibo: generated.id_recibo || null,
        label_url: labelUrl,
        label_source: labelSource,
        label_error: labelError,
        order: withInvoiceFlags(rowToEntity(result.rows[0])),
      });
    }

    // Retirada / transportadora: HTML local
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
      label_source: 'html_local',
      tracking_code: result.rows[0]?.tracking_code || null,
      order: withInvoiceFlags(rowToEntity(result.rows[0])),
    });
  } catch (err) {
    console.error('Erro ao gerar etiqueta:', err);
    if (err?.code === 'CORREIOS_PREPOSTAGEM') {
      const details = Array.isArray(err.details) ? err.details.filter(Boolean) : [];
      const nextSteps = Array.isArray(err.next_steps) ? err.next_steps.filter(Boolean) : [];
      return res.status(400).json({
        message: (err.message && err.message !== 'null')
          ? err.message
          : (details[0] || 'Erro ao gerar rótulo Correios'),
        details,
        next_steps: nextSteps,
        step: err.step || null,
        step_label: err.step_label || null,
        correios_status: err.status || null,
      });
    }
    res.status(500).json({ message: err.message || 'Erro ao gerar etiqueta' });
  }
});

router.post('/:id/melhor-envio/etiqueta', async (req, res) => {
  try {
    const order = await loadOrderOr404(req.params.id, res);
    if (!order) return;

    if (!isMelhorEnvioServiceCode(order.shipping_service_code)) {
      return res.status(400).json({
        message: 'Este pedido não usa frete Melhor Envio. Selecione uma opção ME no checkout.',
      });
    }

    const generated = await generateMelhorEnvioLabel(order);

    const result = await pool.query(
      `UPDATE orders
       SET tracking_code = COALESCE($1, tracking_code),
           shipping_label_url = COALESCE($2, shipping_label_url),
           melhor_envio_cart_id = COALESCE($3, melhor_envio_cart_id),
           melhor_envio_order_id = COALESCE($4, melhor_envio_order_id),
           melhor_envio_protocol = COALESCE($5, melhor_envio_protocol),
           status = CASE WHEN status IN ('confirmado', 'em_preparo', 'pendente') THEN 'enviado' ELSE status END,
           shipped_at = COALESCE(shipped_at, NOW()),
           updated_date = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        generated.tracking_code,
        generated.label_url,
        generated.cart_id,
        generated.order_id,
        generated.protocol,
        order.id,
      ]
    );

    res.json({
      message: 'Etiqueta Melhor Envio gerada com sucesso',
      tracking_code: generated.tracking_code,
      label_url: generated.label_url,
      protocol: generated.protocol,
      melhor_envio_cart_id: generated.cart_id,
      melhor_envio_order_id: generated.order_id,
      order: withInvoiceFlags(rowToEntity(result.rows[0])),
    });
  } catch (err) {
    console.error('Erro ao gerar etiqueta Melhor Envio:', err);
    res.status(400).json({ message: err.message || 'Erro ao gerar etiqueta Melhor Envio' });
  }
});

router.get('/:id/codigo-correios/preflight', async (req, res) => {
  try {
    const order = await loadOrderOr404(req.params.id, res);
    if (!order) return;
    const preflight = await buildCorreiosCodePrerequisites(order);
    res.json(preflight);
  } catch (err) {
    console.error('Erro no preflight Correios:', err);
    res.status(500).json({ message: err.message || 'Erro ao verificar pré-requisitos' });
  }
});

router.post('/:id/codigo-correios', async (req, res) => {
  try {
    const order = await loadOrderOr404(req.params.id, res);
    if (!order) return;

    const generated = await generateCorreiosTrackingCode(order);

    let labelUrl = generated.label_url || null;
    let labelSource = generated.label_source || null;
    let labelError = null;

    // Manual: PDF oficial primeiro; HTML local só como fallback
    if (!labelUrl) {
      try {
        const label = await generateCorreiosShippingLabel(order, {
          trackingCode: generated.tracking_code,
        });
        labelUrl = label.label_url;
        labelSource = 'html_local';
      } catch (labelErr) {
        console.error('Etiqueta HTML falhou após código Correios:', labelErr);
        labelError = labelErr.message || 'Falha ao gerar etiqueta HTML local';
      }
    }

    const result = await pool.query(
      `UPDATE orders
       SET tracking_code = $1,
           shipping_label_url = COALESCE($2, shipping_label_url),
           correios_prepostagem_id = COALESCE($3, correios_prepostagem_id),
           status = CASE WHEN status IN ('confirmado', 'em_preparo', 'pendente') THEN 'enviado' ELSE status END,
           shipped_at = COALESCE(shipped_at, NOW()),
           updated_date = NOW()
       WHERE id = $4
       RETURNING *`,
      [generated.tracking_code, labelUrl, generated.prepostagem_id || null, order.id]
    );

    res.json({
      message: labelError
        ? 'Código de rastreio gerado (etiqueta falhou)'
        : labelSource === 'correios_pdf'
          ? 'Código e rótulo oficial dos Correios gerados'
          : 'Código de rastreio gerado com sucesso',
      tracking_code: generated.tracking_code,
      prepostagem_id: generated.prepostagem_id,
      id_recibo: generated.id_recibo || null,
      label_url: labelUrl,
      label_source: labelSource,
      label_error: labelError,
      order: withInvoiceFlags(rowToEntity(result.rows[0])),
    });
  } catch (err) {
    console.error('Erro ao gerar código Correios:', err);
    const details = Array.isArray(err?.details)
      ? err.details.filter(Boolean)
      : [];
    const nextSteps = Array.isArray(err?.next_steps)
      ? err.next_steps.filter(Boolean)
      : [];
    const message = (err?.message && err.message !== 'null')
      ? err.message
      : (details[0] || 'Erro ao gerar código Correios');

    res.status(400).json({
      message,
      details,
      next_steps: nextSteps,
      step: err?.step || null,
      step_label: err?.step_label || null,
      correios_status: err?.status || null,
    });
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

router.post('/:id/verificar-pagamento-mercado-pago', async (req, res) => {
  try {
    const order = await loadOrderOr404(req.params.id, res);
    if (!order) return;

    if (order.payment_gateway !== 'mercado_pago') {
      return res.status(400).json({
        message: 'Este pedido não foi pago via Mercado Pago',
      });
    }

    const result = await verifyMercadoPagoOrderPayment(pool, order);
    res.json({
      ...result,
      order: withInvoiceFlags(result.order),
    });
  } catch (err) {
    console.error('[Orders] Verificar pagamento MP:', err.message);
    const status = err.status || 500;
    res.status(status).json({
      message: err.message || 'Erro ao verificar pagamento no Mercado Pago',
    });
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
