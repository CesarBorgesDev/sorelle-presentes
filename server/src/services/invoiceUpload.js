import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const INVOICES_DIR = path.join(__dirname, '../../uploads/invoices');

const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_XML_BYTES = 2 * 1024 * 1024;

const TYPE_CONFIG = {
  pdf: {
    mimeTypes: ['application/pdf'],
    extension: 'pdf',
    column: 'invoice_pdf_url',
    label: 'PDF',
  },
  xml: {
    mimeTypes: ['application/xml', 'text/xml', 'application/octet-stream'],
    extension: 'xml',
    column: 'invoice_xml_url',
    label: 'XML',
  },
};

if (!fs.existsSync(INVOICES_DIR)) {
  fs.mkdirSync(INVOICES_DIR, { recursive: true });
}

function parseBase64File(file, fallbackMime) {
  const raw = String(file || '').trim();
  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return { mimeType: dataUrlMatch[1], data: dataUrlMatch[2] };
  }
  return { mimeType: fallbackMime, data: raw };
}

export function getInvoiceTypeConfig(type) {
  return TYPE_CONFIG[type] || null;
}

export function saveInvoiceFile({ orderId, type, file, mimeTypeHint }) {
  const config = getInvoiceTypeConfig(type);
  if (!config) {
    throw new Error('Tipo de arquivo inválido. Use pdf ou xml.');
  }

  const { mimeType, data } = parseBase64File(file, mimeTypeHint || config.mimeTypes[0]);
  if (!config.mimeTypes.includes(mimeType) && type === 'pdf') {
    throw new Error('Envie um arquivo PDF válido.');
  }

  const buffer = Buffer.from(data, 'base64');
  const maxBytes = type === 'pdf' ? MAX_PDF_BYTES : MAX_XML_BYTES;
  if (buffer.length === 0) {
    throw new Error('Arquivo vazio.');
  }
  if (buffer.length > maxBytes) {
    throw new Error(`Arquivo ${config.label} excede o tamanho máximo permitido.`);
  }

  if (type === 'xml') {
    const preview = buffer.toString('utf8', 0, Math.min(buffer.length, 200)).trim();
    if (!preview.startsWith('<')) {
      throw new Error('Envie um XML de nota fiscal válido.');
    }
  }

  if (type === 'pdf' && buffer.slice(0, 4).toString() !== '%PDF') {
    throw new Error('O arquivo PDF parece inválido.');
  }

  const filename = `${orderId}-nota.${config.extension}`;
  const filepath = path.join(INVOICES_DIR, filename);
  fs.writeFileSync(filepath, buffer);

  return {
    storage_path: `invoices/${filename}`,
    filename,
  };
}

export function resolveInvoiceFilePath(storagePath) {
  if (!storagePath) return null;
  const safeName = path.basename(storagePath);
  const filepath = path.join(INVOICES_DIR, safeName);
  if (!filepath.startsWith(INVOICES_DIR)) {
    return null;
  }
  if (!fs.existsSync(filepath)) {
    return null;
  }
  return filepath;
}

export function getInvoiceContentType(type) {
  return type === 'pdf' ? 'application/pdf' : 'application/xml';
}
