import { api } from '@/api/apiClient';

const VISITOR_KEY = 'sorelle_visitor_key';
const SESSION_FLAG = 'sorelle_visit_sent';

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

/** Registra entrada na loja (uma vez por aba/sessão). */
export async function trackSiteVisit(pathname = '/') {
  if (typeof window === 'undefined') return;
  if (String(pathname || '').startsWith('/admin')) return;

  try {
    if (sessionStorage.getItem(SESSION_FLAG) === '1') return;
  } catch {
    // sessionStorage indisponível
  }

  try {
    const visitorKey = ensureVisitorKey();
    await api.analytics.trackVisit({
      visitor_key: visitorKey,
      path: pathname || window.location.pathname || '/',
    });
    try {
      sessionStorage.setItem(SESSION_FLAG, '1');
    } catch {
      // ignore
    }
  } catch {
    // não bloquear a loja se analytics falhar
  }
}
