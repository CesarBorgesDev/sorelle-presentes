import { getSetting } from './settings.js';

export const STORE_PICKUP_ID = 'retirada_loja';

export async function getStorePickupConfig() {
  const enabledSetting = await getSetting('store_pickup_enabled');
  const enabled = enabledSetting === null || enabledSetting === undefined
    ? true
    : enabledSetting === 'true';

  return {
    enabled,
    label: (await getSetting('store_pickup_label')) || 'Retirar na loja',
    address: (await getSetting('store_pickup_address')) || 'Sacramento - MG',
    instructions: (await getSetting('store_pickup_instructions'))
      || 'Aguarde a confirmação do pedido por e-mail antes de retirar.',
    deadline_days: Number((await getSetting('store_pickup_deadline_days')) || 3),
  };
}

export function buildStorePickupOption(config) {
  if (!config?.enabled) return null;

  return {
    id: STORE_PICKUP_ID,
    service_code: 'pickup',
    label: config.label,
    price: 0,
    deadline_days: config.deadline_days,
    available: true,
    pickup: true,
    address: config.address,
    instructions: config.instructions,
  };
}

export async function resolveStorePickupShipping() {
  const config = await getStorePickupConfig();
  const option = buildStorePickupOption(config);
  if (!option) {
    throw new Error('Retirada na loja indisponível no momento');
  }
  return option;
}
