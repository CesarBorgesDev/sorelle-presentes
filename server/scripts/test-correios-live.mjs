/**
 * Configura settings a partir de env e testa token + pré-postagem.
 * Uso (PowerShell):
 *   $env:CORREIOS_API_USER='...'; $env:CORREIOS_API_PASSWORD='...'; ...
 *   node server/scripts/test-correios-live.mjs
 * Não commitar secrets. DATABASE_URL vem de /.env via env.js.
 */
import { setSetting, getSetting } from '../src/services/settings.js';
import { clearCorreiosTokenCache, testCorreiosApiConnection } from '../src/services/correiosAuth.js';
import { testCorreiosPrePostagem } from '../src/services/correiosPrePostagem.js';

function req(name) {
  const v = (process.env[name] || '').trim();
  if (!v) throw new Error(`Defina a variável de ambiente ${name}`);
  return v;
}

async function main() {
  const user = req('CORREIOS_API_USER');
  const key = req('CORREIOS_API_PASSWORD');
  const card = req('CORREIOS_POST_CARD');
  const contract = (process.env.CORREIOS_CONTRACT_NUMBER || '').trim();
  const originZip = (process.env.CORREIOS_ORIGIN_ZIP || '01310100').replace(/\D/g, '').slice(0, 8);
  const destZip = (process.env.CORREIOS_TEST_DEST_ZIP || '20040020').replace(/\D/g, '').slice(0, 8);

  console.log('Salvando settings (sem echo de chave)...');
  await setSetting('correios_api_user', user);
  await setSetting('correios_api_password', key);
  await setSetting('correios_prepostagem_api_password', key);
  await setSetting('correios_post_card', card.replace(/\D/g, ''));
  if (contract) await setSetting('correios_contract_number', contract);
  await setSetting('correios_origin_zip', originZip);
  await setSetting('correios_sender_cnpj', user.replace(/\D/g, ''));
  await setSetting('correios_sender_name', (await getSetting('correios_sender_name')) || 'Sorelle Presentes');

  const street = await getSetting('correios_sender_street');
  if (!street) {
    await setSetting('correios_sender_street', 'Avenida Paulista');
    await setSetting('correios_sender_number', '1000');
    await setSetting('correios_sender_district', 'Bela Vista');
    await setSetting('correios_sender_city', 'São Paulo');
    await setSetting('correios_sender_state', 'SP');
    await setSetting('correios_sender_phone', '11999999999');
  }

  clearCorreiosTokenCache();

  console.log('\n=== Testar API (cartão) ===');
  const apiTest = await testCorreiosApiConnection({
    mode: 'cartaopostagem',
    destinationZip: destZip,
    serviceCode: '03298',
  });
  console.log(JSON.stringify({
    ok: apiTest.ok,
    message: apiTest.message,
    steps: apiTest.steps?.map((s) => ({
      name: s.name,
      ok: s.ok,
      error: s.error,
      pcFinal: s.pcFinal,
      mode: s.mode,
      apis: s.apis_autorizadas,
    })),
  }, null, 2));

  console.log('\n=== Testar pré-postagem ===');
  const pp = await testCorreiosPrePostagem({
    destinationZip: destZip,
    serviceCode: '03298',
  });
  console.log(JSON.stringify({
    ok: pp.ok,
    message: pp.message,
    prepostagem_id: pp.prepostagem_id,
    id_recibo: pp.id_recibo,
    tracking_code: pp.tracking_code,
    pdf_ok: pp.pdf_ok,
    cancelled: pp.cancelled,
    steps: pp.steps?.map((s) => ({
      name: s.name,
      ok: s.ok,
      error: s.error,
      details: s.details,
      status: s.status,
      id_recibo: s.id_recibo,
      tracking_code: s.tracking_code,
    })),
    raw: pp.raw || null,
    next_steps: pp.next_steps,
  }, null, 2));

  if (!apiTest.ok || !pp.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
