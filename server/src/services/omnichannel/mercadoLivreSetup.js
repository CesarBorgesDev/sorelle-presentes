import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';

function publicBase() {
  return (config.appPublicUrl || config.frontendUrl || 'http://localhost:3000').replace(/\/$/, '');
}

export function mercadoLivreCallbackUrl() {
  return `${publicBase()}/api/omnichannel/mercado-livre/callback`;
}

export function mercadoLivreNotificationsUrl() {
  return `${publicBase()}/api/omnichannel/mercado-livre/notifications`;
}

export function frontendAdminUrl(query = '') {
  const base = (config.frontendUrl || config.appPublicUrl || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/admin/omnichannel${query}`;
}

export function signMercadoLivreState() {
  return jwt.sign({ purpose: 'ml_oauth' }, config.jwtSecret, { expiresIn: '15m' });
}

export function verifyMercadoLivreState(state) {
  const payload = jwt.verify(String(state || ''), config.jwtSecret);
  if (payload?.purpose !== 'ml_oauth') {
    throw Object.assign(new Error('Autorização inválida.'), { status: 400 });
  }
}

export function mercadoLivreAuthUrl({ clientId, redirectUri, state }) {
  const url = new URL('https://auth.mercadolivre.com.br/authorization');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
}
