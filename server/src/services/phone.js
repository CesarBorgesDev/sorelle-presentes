const BRAZIL_CC = '55';

export function digitsOnly(raw) {
  return String(raw || '').replace(/\D/g, '');
}

export function normalizeBrazilPhone(raw) {
  let digits = digitsOnly(raw);
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  while (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length < 10) return null;

  if (digits.length === 10 || digits.length === 11) {
    digits = `${BRAZIL_CC}${digits}`;
  }

  if (digits.startsWith(BRAZIL_CC)) {
    if (digits.length < 12 || digits.length > 13) return null;
    return digits;
  }

  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

export function formatPhoneDisplay(phone) {
  const digits = digitsOnly(phone);
  if (!digits) return '';
  if (digits.startsWith(BRAZIL_CC) && digits.length >= 12) {
    const rest = digits.slice(2);
    const ddd = rest.slice(0, 2);
    const number = rest.slice(2);
    if (number.length === 9) {
      return `+55 (${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`;
    }
    if (number.length === 8) {
      return `+55 (${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
    }
  }
  return `+${digits}`;
}

export function phoneToJid(phone) {
  const normalized = normalizeBrazilPhone(phone);
  if (!normalized) return null;
  return `${normalized}@s.whatsapp.net`;
}

export function jidToPhone(jid) {
  const user = String(jid || '').split('@')[0] || '';
  const digits = digitsOnly(user.split(':')[0]);
  return digits || null;
}

export function isIgnoredJid(jid) {
  const value = String(jid || '');
  if (!value) return true;
  if (value === 'status@broadcast') return true;
  if (value.endsWith('@g.us')) return true;
  if (value.endsWith('@broadcast')) return true;
  if (value.endsWith('@newsletter')) return true;
  if (value.endsWith('@lid') && !value.includes('@s.whatsapp.net')) {
    return false;
  }
  return false;
}

export function isSameJid(a, b) {
  if (!a || !b) return false;
  const phoneA = jidToPhone(a);
  const phoneB = jidToPhone(b);
  return Boolean(phoneA && phoneB && phoneA === phoneB);
}
