export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function emailLocalPart(email) {
  return String(email || '').split('@')[0].trim().toLowerCase();
}

/** True when the "name" is empty or just the part before @ in the e-mail (ex.: mxpv). */
export function isPlaceholderFullName(name, email) {
  const n = String(name || '').trim();
  if (!n) return true;
  const local = emailLocalPart(email);
  return Boolean(local) && n.toLowerCase() === local;
}

export function resolvePersonName(name, email) {
  const n = String(name || '').trim();
  if (!n || isPlaceholderFullName(n, email)) return '';
  return n;
}

export function normalizeZipCode(value) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits || null;
}

export function normalizeDocument(value) {
  const digits = onlyDigits(value).slice(0, 14);
  return digits || null;
}

/**
 * Campos obrigatórios do cadastro de cliente:
 * Nome, Endereço, Telefone, E-mail, CEP e CPF.
 */
export function getMissingProfileFields(user, { requireEmail = true } = {}) {
  if (!user) {
    return ['Nome', 'Endereço', 'Telefone', 'E-mail', 'CEP', 'CPF'];
  }

  const missing = [];
  if (requireEmail && !String(user.email || '').trim()) missing.push('E-mail');
  if (!resolvePersonName(user.full_name, user.email)) missing.push('Nome');
  if (!String(user.address || '').trim()) missing.push('Endereço');
  if (onlyDigits(user.phone).length < 10) missing.push('Telefone');
  if (onlyDigits(user.zip_code).length !== 8) missing.push('CEP');

  const doc = onlyDigits(user.document);
  if (doc.length !== 11 && doc.length !== 14) missing.push('CPF');

  return missing;
}

export function isProfileComplete(user, options) {
  return getMissingProfileFields(user, options).length === 0;
}

export function profileIncompleteMessage(user, options) {
  const missing = getMissingProfileFields(user, options);
  if (missing.length === 0) return null;
  return `Preencha os campos obrigatórios: ${missing.join(', ')}.`;
}
