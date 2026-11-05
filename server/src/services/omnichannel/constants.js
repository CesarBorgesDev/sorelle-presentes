export const CHANNELS = [
  {
    id: 'mercado_livre',
    label: 'Mercado Livre',
    hint: 'Crie o aplicativo em developers.mercadolibre.com.br com a Redirect URI indicada abaixo. Autorize a conta pelo botão, ou cole access token e refresh token.',
    fields: [
      { key: 'client_id', label: 'App ID', required: true },
      { key: 'client_secret', label: 'Secret', secret: true, required: true },
      { key: 'redirect_uri', label: 'Redirect URI', placeholder: 'Preenchida automaticamente' },
      { key: 'code', label: 'Code de autorização', secret: true },
      { key: 'access_token', label: 'Access token', secret: true },
      { key: 'refresh_token', label: 'Refresh token', secret: true },
      { key: 'user_id', label: 'User ID do vendedor' },
      {
        key: 'listing_type_id',
        label: 'Tipo de anúncio',
        options: [
          { value: 'gold_special', label: 'Clássico' },
          { value: 'gold_pro', label: 'Premium' },
        ],
      },
      {
        key: 'shipping_mode',
        label: 'Frete',
        options: [
          { value: 'me2', label: 'Mercado Envios' },
          { value: 'not_specified', label: 'A combinar' },
        ],
      },
    ],
  },
  {
    id: 'magalu',
    label: 'Magazine Luiza',
    hint: 'Use o app do Magalu Devs (OAuth). Produção chama api.magalu.com. Informe o code do seller ou um access token já emitido.',
    fields: [
      { key: 'client_id', label: 'Client ID', required: true },
      { key: 'client_secret', label: 'Client secret', secret: true, required: true },
      { key: 'redirect_uri', label: 'Redirect URI' },
      { key: 'code', label: 'Code de autorização', secret: true },
      { key: 'access_token', label: 'Access token', secret: true },
      { key: 'refresh_token', label: 'Refresh token', secret: true },
      { key: 'environment', label: 'Ambiente (production ou sandbox)', placeholder: 'production' },
    ],
  },
  {
    id: 'shopee',
    label: 'Shopee',
    hint: 'App na Shopee Open Platform. A assinatura usa partner id, partner key, shop id e access token.',
    fields: [
      { key: 'partner_id', label: 'Partner ID', required: true },
      { key: 'partner_key', label: 'Partner key', secret: true, required: true },
      { key: 'shop_id', label: 'Shop ID', required: true },
      { key: 'access_token', label: 'Access token', secret: true, required: true },
      { key: 'refresh_token', label: 'Refresh token', secret: true },
      { key: 'environment', label: 'Ambiente (production ou sandbox)', placeholder: 'production' },
    ],
  },
  {
    id: 'temu',
    label: 'Temu',
    hint: 'App na Temu Partner Platform. A loja no Brasil usa o host global. A assinatura é MD5 com app secret.',
    fields: [
      { key: 'app_key', label: 'App key', required: true },
      { key: 'app_secret', label: 'App secret', secret: true, required: true },
      { key: 'access_token', label: 'Access token', secret: true, required: true },
      { key: 'api_base', label: 'Host da API', placeholder: 'https://openapi-b-global.temu.com' },
    ],
  },
  {
    id: 'tiktok_shop',
    label: 'TikTok Shop',
    hint: 'App no TikTok Shop Partner Center. Informe app key, app secret e o code de autorização, ou access token e shop cipher.',
    fields: [
      { key: 'app_key', label: 'App key', required: true },
      { key: 'app_secret', label: 'App secret', secret: true, required: true },
      { key: 'code', label: 'Auth code', secret: true },
      { key: 'access_token', label: 'Access token', secret: true },
      { key: 'refresh_token', label: 'Refresh token', secret: true },
      { key: 'shop_id', label: 'Shop ID' },
      { key: 'shop_cipher', label: 'Shop cipher' },
      { key: 'warehouse_id', label: 'Warehouse ID' },
    ],
  },
];

export const CHANNEL_IDS = CHANNELS.map((channel) => channel.id);

export const SECRET_KEYS = new Set([
  'client_secret',
  'access_token',
  'refresh_token',
  'partner_key',
  'app_secret',
  'code',
]);

export function getChannel(id) {
  return CHANNELS.find((channel) => channel.id === id) || null;
}
