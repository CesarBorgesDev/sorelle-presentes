export function buildAddressString({
  street,
  number,
  complement,
  district,
  city,
  state,
} = {}) {
  const parts = [
    street,
    number ? `nº ${number}` : null,
    complement,
    district,
    city,
    state,
  ].filter(Boolean);
  return parts.join(', ');
}

export function normalizeAddressInput(body = {}) {
  const street = String(body.address_street || '').trim();
  const number = String(body.address_number || '').trim();
  const complement = String(body.address_complement || '').trim();
  const district = String(body.address_district || '').trim();
  const city = String(body.address_city || '').trim();
  const state = String(body.address_state || '').trim().toUpperCase().slice(0, 2);

  return {
    address_street: street,
    address_number: number,
    address_complement: complement,
    address_district: district,
    address_city: city,
    address_state: state,
    customer_address: buildAddressString({
      street,
      number,
      complement,
      district,
      city,
      state,
    }),
  };
}

export function validateAddressFields(address) {
  const missing = [];
  if (!address.address_street) missing.push('rua');
  if (!address.address_number) missing.push('número');
  if (!address.address_district) missing.push('bairro');
  if (!address.address_city) missing.push('cidade');
  if (!address.address_state) missing.push('UF');
  return missing;
}

/**
 * Extrai CEP de notes do pedido (ex.: "CEP: 38130000 | Desconto PIX: ...").
 */
export function extractZipFromNotes(notes) {
  const match = String(notes || '').match(/CEP:\s*(\d{5}-?\d{3}|\d{8})/i);
  return match ? match[1].replace(/\D/g, '').slice(0, 8) : '';
}

/**
 * Interpreta o texto gerado por buildAddressString:
 * "Rua, nº 123, Complemento?, Bairro, Cidade, UF"
 * (complemento opcional — o parser antigo deslocava cidade/UF quando faltava).
 */
export function parseCustomerAddressString(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return {
      street: '',
      number: 'S/N',
      complement: '',
      district: '',
      city: '',
      state: '',
    };
  }

  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 1) {
    return {
      street: parts[0],
      number: 'S/N',
      complement: '',
      district: '',
      city: '',
      state: '',
    };
  }

  let state = '';
  let end = parts.length;
  const last = parts[parts.length - 1] || '';
  if (/^[A-Za-z]{2}$/.test(last)) {
    state = last.toUpperCase();
    end -= 1;
  }

  const city = end > 1 ? parts[end - 1] : '';
  if (city) end -= 1;

  const district = end > 1 ? parts[end - 1] : '';
  if (district) end -= 1;

  const street = parts[0] || raw;
  let number = 'S/N';
  let numberIdx = -1;
  for (let i = 1; i < end; i += 1) {
    const match = parts[i].match(/^n[ºo°.]?\s*(.+)$/i);
    if (match) {
      number = match[1].trim() || 'S/N';
      numberIdx = i;
      break;
    }
  }

  const complementParts = [];
  for (let i = 1; i < end; i += 1) {
    if (i === numberIdx) continue;
    complementParts.push(parts[i]);
  }

  return {
    street,
    number,
    complement: complementParts.join(', '),
    district,
    city,
    state,
  };
}

/**
 * Endereço do destinatário a partir do pedido (customer_address + CEP em notes).
 */
export function parseOrderRecipientAddress(order = {}) {
  const fromFields = order.address_street
    ? {
      street: String(order.address_street || '').trim(),
      number: String(order.address_number || 'S/N').trim() || 'S/N',
      complement: String(order.address_complement || '').trim(),
      district: String(order.address_district || '').trim(),
      city: String(order.address_city || '').trim(),
      state: String(order.address_state || '').trim().toUpperCase().slice(0, 2),
    }
    : parseCustomerAddressString(order.customer_address);

  const zip = extractZipFromNotes(order.notes)
    || String(order.customer_zip_code || '').replace(/\D/g, '').slice(0, 8);

  return {
    ...fromFields,
    zip,
    formatted: order.customer_address || buildAddressString(fromFields),
  };
}

export function toCieloAddress(customer = {}) {
  if (customer.address_street) {
    return {
      Street: customer.address_street.slice(0, 128),
      Number: (customer.address_number || 'S/N').slice(0, 15),
      Complement: customer.address_complement?.slice(0, 64) || undefined,
      District: (customer.address_district || 'Centro').slice(0, 64),
      City: (customer.address_city || 'Sao Paulo').slice(0, 64),
      State: (customer.address_state || 'SP').slice(0, 2).toUpperCase(),
    };
  }

  const parsed = parseCustomerAddressString(customer.customer_address);
  if (!parsed.street) {
    return {
      Street: 'Endereco nao informado',
      Number: 'S/N',
      District: 'Centro',
      City: 'Sao Paulo',
      State: 'SP',
    };
  }

  return {
    Street: parsed.street.slice(0, 128),
    Number: (parsed.number || 'S/N').slice(0, 15),
    Complement: parsed.complement?.slice(0, 64) || undefined,
    District: (parsed.district || 'Centro').slice(0, 64),
    City: (parsed.city || 'Sao Paulo').slice(0, 64),
    State: (parsed.state || 'SP').slice(0, 2).toUpperCase(),
  };
}
