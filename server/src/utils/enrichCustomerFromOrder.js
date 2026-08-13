import { extractDocumentFromNotes, extractZipFromNotes, hydrateUserAddress } from './address.js';
import { isPlaceholderFullName, resolvePersonName } from './userProfile.js';

function empty(value) {
  return value == null || String(value).trim() === '';
}

/**
 * Preenche campos vazios do cadastro com dados da última compra.
 */
export function enrichCustomerFromLastOrder(customer, lastOrder) {
  if (!customer) {
    return {
      customer,
      data_from_last_order: false,
      filled_from_last_order: [],
    };
  }

  const next = { ...customer };
  const filled = [];

  const registeredName = resolvePersonName(next.full_name, next.email);
  const orderName = resolvePersonName(lastOrder?.customer_name, next.email);
  if (!registeredName && orderName) {
    next.full_name = orderName;
    filled.push('full_name');
  } else if (!registeredName && isPlaceholderFullName(next.full_name, next.email)) {
    next.full_name = null;
  }

  if (!lastOrder) {
    return {
      ...hydrateUserAddress(next),
      data_from_last_order: filled.length > 0,
      filled_from_last_order: filled,
    };
  }

  const zipFromOrder = extractZipFromNotes(lastOrder.notes);
  const documentFromOrder = extractDocumentFromNotes(lastOrder.notes);

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
    ...hydrateUserAddress(next),
    data_from_last_order: filled.length > 0,
    filled_from_last_order: filled,
  };
}
