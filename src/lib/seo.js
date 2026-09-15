export const SITE_NAME = 'Sorelle Presentes';
export const SITE_TAGLINE = 'Casa, Decoração & Fragrâncias';
export const DEFAULT_TITLE = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const DEFAULT_DESCRIPTION =
  'Loja de presentes e decoração em Sacramento-MG. Curadoria de peças para casa, decoração, fragrâncias e cama, mesa e banho.';
export const DEFAULT_OG_IMAGE =
  'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/b0b1ab800_generated_image.png';

const NOINDEX_PREFIXES = [
  '/admin',
  '/checkout',
  '/conta',
  '/login',
  '/register',
  '/completar-cadastro',
  '/forgot-password',
  '/reset-password',
  '/auth',
  '/pagamento',
  '/diagnostico-api',
];

export function isNoIndexPath(pathname = '') {
  const path = String(pathname || '').split('?')[0];
  return NOINDEX_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function getSiteOrigin() {
  if (typeof window === 'undefined') return 'https://sorellepresentes.com.br';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return window.location.origin;
  }
  return 'https://sorellepresentes.com.br';
}

export function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncateText(value, max = 160) {
  const text = stripHtml(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

export function buildPageTitle(title) {
  const name = String(title || '').trim();
  if (!name || name === SITE_NAME || name.startsWith(SITE_NAME)) return name || DEFAULT_TITLE;
  return `${name} | ${SITE_NAME}`;
}

export function toCanonicalUrl(path = '/') {
  const clean = String(path || '/')
    .split('?')[0]
    .split('#')[0] || '/';
  const normalized = clean !== '/' ? clean.replace(/\/+$/, '') : '/';
  return `${getSiteOrigin()}${normalized.startsWith('/') ? normalized : `/${normalized}`}`;
}

export function organizationJsonLd() {
  const origin = getSiteOrigin();
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: SITE_NAME,
    url: origin,
    image: DEFAULT_OG_IMAGE,
    email: 'contato@sorellepresentes.com.br',
    telephone: '+55-34-3351-1975',
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Sacramento',
      addressRegion: 'MG',
      addressCountry: 'BR',
    },
    sameAs: [
      'https://www.instagram.com/sorellepresentes/',
      'https://www.facebook.com/share/1ERxDH7Ucd/',
    ],
  };
}

export function websiteJsonLd() {
  const origin = getSiteOrigin();
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: origin,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${origin}/busca?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}
