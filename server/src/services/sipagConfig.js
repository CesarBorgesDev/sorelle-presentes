import fs from 'fs';
import { getSetting } from './settings.js';

const DEFAULT_TEST_API_URL = 'https://test.ipg-online.com/ipgapi/services';
const DEFAULT_PRODUCTION_API_URL = 'https://www2.ipg-online.com/ipgapi/services';

export const PAYMENT_GATEWAYS = {
  cielo: { id: 'cielo', label: 'Cielo (Checkout Cielo)' },
  sipag: { id: 'sipag', label: 'SiPag (IPG Online / Fiserv)' },
  mercado_pago: { id: 'mercado_pago', label: 'Mercado Pago (Checkout Pro)' },
};

const DEFAULT_GATEWAY = 'cielo';

function readCertFromPath(pathValue) {
  if (!pathValue?.trim()) return '';
  try {
    return fs.readFileSync(pathValue.trim(), 'utf8');
  } catch {
    return '';
  }
}

export async function getPaymentGateway() {
  const raw = ((await getSetting('payment_gateway')) || process.env.PAYMENT_GATEWAY || DEFAULT_GATEWAY).trim().toLowerCase();
  return PAYMENT_GATEWAYS[raw] ? raw : DEFAULT_GATEWAY;
}

export async function getSipagConfig() {
  const storeId = ((await getSetting('sipag_store_id')) || process.env.SIPAG_STORE_ID || '').trim();
  const userId = ((await getSetting('sipag_user_id')) || process.env.SIPAG_USER_ID || '').trim();
  const userPassword = ((await getSetting('sipag_user_password')) || process.env.SIPAG_USER_PASSWORD || '').trim();
  const certPassword = ((await getSetting('sipag_cert_password')) || process.env.SIPAG_CERT_PASSWORD || '').trim();
  const softDescriptor = ((await getSetting('sipag_soft_descriptor')) || process.env.SIPAG_SOFT_DESCRIPTOR || 'SORELLE').trim();
  const environment = ((await getSetting('sipag_environment')) || process.env.SIPAG_ENVIRONMENT || 'test').trim().toLowerCase();
  const frontendUrl = ((await getSetting('sipag_frontend_url')) || process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');

  let certPem = ((await getSetting('sipag_cert_pem')) || process.env.SIPAG_CERT_PEM || '').trim();
  let certKey = ((await getSetting('sipag_cert_key')) || process.env.SIPAG_CERT_KEY || '').trim();

  if (!certPem) {
    certPem = readCertFromPath(process.env.SIPAG_CERT_PEM_PATH);
  }
  if (!certKey) {
    certKey = readCertFromPath(process.env.SIPAG_CERT_KEY_PATH);
  }

  const apiUrl = environment === 'production'
    ? ((await getSetting('sipag_api_url')) || process.env.SIPAG_API_URL || DEFAULT_PRODUCTION_API_URL).trim()
    : ((await getSetting('sipag_api_url')) || process.env.SIPAG_API_URL || DEFAULT_TEST_API_URL).trim();

  const hasCredentials = Boolean(storeId && userId && userPassword && certPem && certKey);

  return {
    storeId,
    userId,
    userPassword,
    certPassword,
    certPem,
    certKey,
    softDescriptor: softDescriptor.slice(0, 16),
    environment,
    environmentLabel: environment === 'production' ? 'Produção' : 'Teste',
    apiUrl,
    frontendUrl,
    returnUrlExample: `${frontendUrl}/pagamento/retorno?pedido=ID_DO_PEDIDO`,
    isReady: hasCredentials,
    hasCredentials,
  };
}

export function getSipagRequirements(config) {
  return [
    {
      id: 'store_id',
      label: 'Store ID configurado',
      required: true,
      done: Boolean(config.storeId),
      hint: 'Fornecido pela SiPag ao habilitar e-commerce (IPG)',
    },
    {
      id: 'user_id',
      label: 'User ID (usuário API) configurado',
      required: true,
      done: Boolean(config.userId),
      hint: 'Ex.: WST279925._.1 — enviado com senha via Basic Auth',
    },
    {
      id: 'user_password',
      label: 'Senha do usuário API configurada',
      required: true,
      done: Boolean(config.userPassword),
      hint: 'Credencial fornecida pela SiPag junto com o User ID',
    },
    {
      id: 'certificates',
      label: 'Certificado cliente (.pem + .key) configurado',
      required: true,
      done: Boolean(config.certPem && config.certKey),
      hint: 'mTLS obrigatório na API IPG Online. Informe o conteúdo PEM ou caminhos no .env',
    },
    {
      id: 'cert_password',
      label: 'Senha do certificado configurada',
      required: true,
      done: Boolean(config.certPassword),
      hint: 'Senha do arquivo .key fornecida pela SiPag',
    },
    {
      id: 'frontend_url',
      label: 'URL do site (retorno após pagamento)',
      required: true,
      done: Boolean(config.frontendUrl),
      hint: 'Cliente volta para /pagamento/retorno?pedido=ID após pagar na página SiPag',
    },
    {
      id: 'ecommerce_contract',
      label: 'E-commerce habilitado no contrato SiPag',
      required: true,
      done: false,
      hint: 'Solicite captura e-commerce na cooperativa Sicoob / Central SiPag',
      manual: true,
    },
  ];
}
