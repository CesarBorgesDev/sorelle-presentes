import { api } from '@/api/apiClient';

const VISITOR_KEY = 'sorelle_visitor_key';

function ensureVisitorKey() {
  try {
    let key = localStorage.getItem(VISITOR_KEY);
    if (key && /^[a-zA-Z0-9_-]{8,64}$/.test(key)) return key;
    key = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/-/g, '');
    localStorage.setItem(VISITOR_KEY, key);
    return key;
  } catch {
    return `tmp-${Date.now()}`;
  }
}

/** Registra visita da loja e visualização de produto, se for o caso. */
export async function trackSiteVisit(pathname = '/') {
  if (typeof window === 'undefined') return;
  if (String(pathname || '').startsWith('/admin')) return;

  try {
    const visitorKey = ensureVisitorKey();
    await api.analytics.trackVisit({
      visitor_key: visitorKey,
      path: pathname || window.location.pathname || '/',
    });
  } catch {
    // não bloquear a loja se analytics falhar
  }
}
