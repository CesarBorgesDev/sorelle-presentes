import fs from 'fs';
import { getInvoiceContentType, getInvoiceTypeConfig, resolveInvoiceFilePath } from './invoiceUpload.js';

export function orderHasInvoicePdf(order) {
  return Boolean(order?.invoice_pdf_url);
}

export function orderHasInvoiceXml(order) {
  return Boolean(order?.invoice_xml_url);
}

export function withInvoiceFlags(order) {
  if (!order) return order;
  return {
    ...order,
    has_invoice_pdf: orderHasInvoicePdf(order),
    has_invoice_xml: orderHasInvoiceXml(order),
    invoice_pdf_url: undefined,
    invoice_xml_url: undefined,
  };
}

export function withInvoiceFlagsList(orders) {
  return orders.map(withInvoiceFlags);
}

export function streamOrderInvoice({ order, type, res, downloadName }) {
  const config = getInvoiceTypeConfig(type);
  if (!config) {
    res.status(400).json({ message: 'Tipo de nota fiscal inválido' });
    return false;
  }

  const storagePath = order[config.column];
  if (!storagePath) {
    res.status(404).json({ message: `Nota fiscal ${config.label} não encontrada para este pedido` });
    return false;
  }

  const filepath = resolveInvoiceFilePath(storagePath);
  if (!filepath) {
    res.status(404).json({ message: 'Arquivo da nota fiscal não encontrado no servidor' });
    return false;
  }

  const filename = downloadName || `nota-fiscal-${order.id}.${config.extension}`;
  res.setHeader('Content-Type', getInvoiceContentType(type));
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  fs.createReadStream(filepath).pipe(res);
  return true;
}
