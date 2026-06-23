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

  const text = String(customer.customer_address || '').trim();
  if (!text) {
    return {
      Street: 'Endereco nao informado',
      Number: 'S/N',
      District: 'Centro',
      City: 'Sao Paulo',
      State: 'SP',
    };
  }

  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  return {
    Street: parts[0] || text,
    Number: parts[1] || 'S/N',
    Complement: parts[2] || undefined,
    District: parts[3] || 'Centro',
    City: parts[4] || 'Sao Paulo',
    State: (parts[5] || 'SP').slice(0, 2).toUpperCase(),
  };
}
