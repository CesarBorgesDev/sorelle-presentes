import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSenderLabelConfig, normalizeTrackingCode } from './correiosTracking.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LABELS_DIR = path.join(__dirname, '../../uploads/labels');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractZipFromNotes(notes) {
  const match = String(notes || '').match(/CEP:\s*(\d{5}-?\d{3}|\d{8})/i);
  return match ? match[1].replace(/\D/g, '') : '';
}

function buildSenderBlock(sender) {
  const lines = [
    sender.name,
    sender.street,
    [sender.city, sender.state].filter(Boolean).join(' - '),
    sender.zip ? `CEP ${sender.zip.replace(/(\d{5})(\d{3})/, '$1-$2')}` : '',
    sender.phone ? `Tel: ${sender.phone}` : '',
  ].filter(Boolean);

  return lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('');
}

export async function generateCorreiosShippingLabel(order, { trackingCode } = {}) {
  if (!fs.existsSync(LABELS_DIR)) {
    fs.mkdirSync(LABELS_DIR, { recursive: true });
  }

  const sender = await getSenderLabelConfig();
  const code = normalizeTrackingCode(trackingCode || order.tracking_code);
  const destinationZip = extractZipFromNotes(order.notes);
  const filename = `etiqueta-${order.id}.html`;
  const filepath = path.join(LABELS_DIR, filename);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Etiqueta Correios — Pedido ${escapeHtml(order.id)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
    .sheet { width: 10cm; min-height: 15cm; border: 2px solid #111; padding: 12px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #999; padding-bottom: 8px; margin-bottom: 12px; }
    .logo { font-size: 18px; font-weight: 700; letter-spacing: 0.08em; }
    .service { font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .block { margin-bottom: 14px; }
    .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin-bottom: 4px; }
    .content { font-size: 13px; line-height: 1.45; }
    .tracking { margin-top: 16px; padding: 10px; border: 1px dashed #666; text-align: center; }
    .tracking-code { font-size: 18px; font-weight: 700; letter-spacing: 0.12em; margin-top: 6px; }
    .meta { font-size: 11px; color: #444; margin-top: 12px; }
    @media print {
      body { margin: 0; }
      .sheet { border-width: 1px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;margin-bottom:16px;">
    <button onclick="window.print()">Imprimir etiqueta</button>
  </div>
  <div class="sheet">
    <div class="header">
      <div class="logo">CORREIOS</div>
      <div class="service">${escapeHtml(order.shipping_service_name || 'PAC/SEDEX')}</div>
    </div>

    <div class="block">
      <div class="label">Remetente</div>
      <div class="content">${buildSenderBlock(sender)}</div>
    </div>

    <div class="block">
      <div class="label">Destinatário</div>
      <div class="content">
        <div><strong>${escapeHtml(order.customer_name)}</strong></div>
        <div>${escapeHtml(order.customer_address)}</div>
        ${destinationZip ? `<div>CEP ${escapeHtml(destinationZip.replace(/(\d{5})(\d{3})/, '$1-$2'))}</div>` : ''}
        ${order.customer_phone ? `<div>Tel: ${escapeHtml(order.customer_phone)}</div>` : ''}
      </div>
    </div>

    <div class="block meta">
      <div>Pedido: ${escapeHtml(order.id)}</div>
      <div>Data: ${escapeHtml(new Date(order.created_date).toLocaleDateString('pt-BR'))}</div>
      <div>Valor declarado: R$ ${Number(order.total || 0).toFixed(2).replace('.', ',')}</div>
    </div>

    <div class="tracking">
      <div class="label">Objeto / Rastreio</div>
      <div class="tracking-code">${code ? escapeHtml(code) : 'Informar após postagem'}</div>
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(filepath, html, 'utf-8');

  return {
    label_url: `/api/uploads/labels/${filename}`,
    tracking_code: code || null,
    generated_at: new Date().toISOString(),
  };
}
