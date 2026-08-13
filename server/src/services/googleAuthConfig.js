import { getSetting } from './settings.js';
import { config } from '../config/env.js';

export async function getGoogleAuthConfig() {
  const clientId = (
    (await getSetting('google_client_id'))
    || process.env.GOOGLE_CLIENT_ID
    || ''
  ).trim();
  const clientSecret = (
    (await getSetting('google_client_secret'))
    || process.env.GOOGLE_CLIENT_SECRET
    || ''
  ).trim();
  const callbackUrl = (
    (await getSetting('google_callback_url'))
    || process.env.GOOGLE_CALLBACK_URL
    || config.googleCallbackUrl
    || ''
  ).trim();

  const configured = Boolean(clientId && clientSecret && callbackUrl);

  return {
    clientId,
    clientSecret,
    callbackUrl,
    configured,
    isReady: configured,
    consoleUrl: 'https://console.cloud.google.com/apis/credentials',
  };
}

export function getGoogleAuthRequirements(cfg) {
  return [
    {
      id: 'client_id',
      label: 'Client ID configurado',
      hint: 'ID do cliente OAuth (aplicativo da Web) no Google Cloud',
      required: true,
      done: Boolean(cfg?.clientId),
    },
    {
      id: 'client_secret',
      label: 'Client Secret configurado',
      hint: 'Segredo do cliente OAuth no Google Cloud',
      required: true,
      done: Boolean(cfg?.clientSecret),
    },
    {
      id: 'callback',
      label: 'URI de redirecionamento',
      hint: cfg?.callbackUrl || 'APP_PUBLIC_URL/api/auth/google/callback',
      required: true,
      done: Boolean(cfg?.callbackUrl),
      manual: true,
    },
  ];
}
