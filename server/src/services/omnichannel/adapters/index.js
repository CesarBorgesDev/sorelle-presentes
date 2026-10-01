import { mercadoLivreAdapter } from './mercadoLivre.js';
import { magaluAdapter } from './magalu.js';
import { shopeeAdapter } from './shopee.js';
import { temuAdapter } from './temu.js';
import { tiktokShopAdapter } from './tiktokShop.js';

const adapters = {
  mercado_livre: mercadoLivreAdapter,
  magalu: magaluAdapter,
  shopee: shopeeAdapter,
  temu: temuAdapter,
  tiktok_shop: tiktokShopAdapter,
};

export function getAdapter(channel) {
  const adapter = adapters[channel];
  if (!adapter) {
    throw new Error('Canal desconhecido.');
  }
  return adapter;
}
