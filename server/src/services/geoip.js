const cache = new Map();
const CACHE_LIMIT = 2000;
const LOOKUP_TIMEOUT_MS = 2500;

function normalizeIp(raw) {
  let ip = String(raw || '').trim();
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === '0.0.0.0') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  const match = ip.match(/^172\.(\d+)\./);
  if (match) {
    const second = Number(match[1]);
    if (second >= 16 && second <= 31) return true;
  }
  const lower = ip.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
  return false;
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return normalizeIp(forwarded);
  }
  return normalizeIp(req.ip || req.socket?.remoteAddress || '');
}

function remember(ip, geo) {
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(ip, geo);
  return geo;
}

function localizeCountry(country) {
  if (country === 'Brazil') return 'Brasil';
  if (country === 'United States') return 'Estados Unidos';
  if (country === 'Portugal') return 'Portugal';
  return country;
}

export async function lookupGeo(ip) {
  const normalized = normalizeIp(ip);
  if (isPrivateIp(normalized)) {
    return { country: null, region: null, city: 'Rede local' };
  }

  if (cache.has(normalized)) return cache.get(normalized);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://ipwho.is/${encodeURIComponent(normalized)}?fields=success,country,region,city`,
      { signal: controller.signal }
    );
    if (!response.ok) {
      return remember(normalized, { country: null, region: null, city: null });
    }

    const data = await response.json();
    if (!data?.success) {
      return remember(normalized, { country: null, region: null, city: null });
    }

    return remember(normalized, {
      country: localizeCountry(String(data.country || '').trim()) || null,
      region: String(data.region || '').trim() || null,
      city: String(data.city || '').trim() || null,
    });
  } catch {
    return { country: null, region: null, city: null };
  } finally {
    clearTimeout(timer);
  }
}
