import { extractDocumentFromNotes, extractZipFromNotes } from './address.js';

function empty(value) {
  return value == null || String(value).trim() === '';
}

/**
 * Preenche campos vazios do cadastro com dados da última compra.
 */
export function enrichCustomerFromLastOrder(customer, lastOrder) {
  if (!customer || !lastOrder) {
    return {
      ...customer,
      data_from_last_order: false,
      filled_from_last_order: [],
    };
  }

  const zipFromOrder = extractZipFromNotes(lastOrder.notes);
  const documentFromOrder = extractDocumentFromNotes(lastOrder.notes);
  const filled = [];

  const next = { ...customer };

  if (empty(next.full_name) && !empty(lastOrder.customer_name)) {
    next.full_name = String(lastOrder.customer_name).trim();
    filled.push('full_name');
  }
  if (empty(next.phone) && !empty(lastOrder.customer_phone)) {
    next.phone = String(lastOrder.customer_phone).trim();
    filled.push('phone');
  }
  if (empty(next.address) && !empty(lastOrder.customer_address)) {
    next.address = String(lastOrder.customer_address).trim();
    filled.push('address');
  }
  if (empty(next.zip_code) && zipFromOrder) {
    next.zip_code = zipFromOrder;
    filled.push('zip_code');
  }
  if (empty(next.document) && documentFromOrder) {
    next.document = documentFromOrder;
    filled.push('document');
  }

  return {
    ...next,
    data_from_last_order: filled.length > 0,
    filled_from_last_order: filled,
  };
}
