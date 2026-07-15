import { getSipagConfig } from './sipagConfig.js';
import {
  postSipagSoap,
  buildCreatePaymentUrlXml,
  buildInquiryOrderXml,
} from './sipagClient.js';
import {
  parseSipagCreatePaymentUrlResponse,
  parseSipagInquiryOrderResponse,
} from '../utils/sipagWebhook.js';

export async function createSipagPaymentUrl({ amount, pageText, config: configOverride }) {
  const config = configOverride || await getSipagConfig();
  if (!config.isReady) {
    throw new Error('SiPag não configurada. Informe Store ID, usuário, senha e certificados no admin.');
  }

  const xml = buildCreatePaymentUrlXml({
    config,
    amount,
    pageText,
  });

  const response = await postSipagSoap(xml, config);
  if (response.status >= 400) {
    console.error('[SiPag] Erro HTTP ao criar Payment URL:', response.status, response.body?.slice(0, 500));
    throw new Error('Falha na comunicação com a SiPag');
  }

  return parseSipagCreatePaymentUrlResponse(response.body);
}

export async function inquireSipagOrder(orderId, configOverride) {
  const config = configOverride || await getSipagConfig();
  if (!config.isReady || !orderId) return null;

  const xml = buildInquiryOrderXml({ config, orderId });
  const response = await postSipagSoap(xml, config);
  if (response.status >= 400) {
    console.error('[SiPag] Erro HTTP ao consultar pedido:', response.status, orderId);
    return null;
  }

  return parseSipagInquiryOrderResponse(response.body);
}
