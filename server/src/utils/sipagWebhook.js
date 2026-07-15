import { extractXmlTag, extractAllXmlTags } from './sipagXml.js';

const APPROVED_RESULTS = new Set(['APPROVED', 'SUCCESS', 'CAPTURED']);
const DECLINED_RESULTS = new Set(['DECLINED', 'FAILED', 'DENIED']);
const PENDING_RESULTS = new Set(['PENDING', 'WAITING']);

export function mapSipagTransactionResult(result) {
  const normalized = String(result || '').trim().toUpperCase();
  if (!normalized) return null;
  if (APPROVED_RESULTS.has(normalized)) return 'pago';
  if (DECLINED_RESULTS.has(normalized)) return 'recusado';
  if (PENDING_RESULTS.has(normalized)) return 'aguardando_pagamento';
  return null;
}

export function parseSipagCreatePaymentUrlResponse(xml) {
  const successfully = extractXmlTag(xml, 'successfully');
  if (successfully && successfully.toLowerCase() === 'false') {
    const fault = extractXmlTag(xml, 'faultstring') || extractXmlTag(xml, 'ErrorMessage');
    throw new Error(fault || 'SiPag não retornou URL de pagamento');
  }

  const paymentUrl = extractXmlTag(xml, 'paymentUrl');
  if (!paymentUrl) {
    const fault = extractXmlTag(xml, 'faultstring') || extractXmlTag(xml, 'ErrorMessage');
    throw new Error(fault || 'SiPag não retornou URL de pagamento');
  }

  return {
    paymentUrl,
    orderId: extractXmlTag(xml, 'OrderId'),
    transactionId: extractXmlTag(xml, 'TransactionId'),
  };
}

export function parseSipagInquiryOrderResponse(xml) {
  const transactionResults = extractAllXmlTags(xml, 'TransactionResult');
  const approvalCodes = extractAllXmlTags(xml, 'ApprovalCode');
  const ipgTransactionIds = extractAllXmlTags(xml, 'IpgTransactionId');
  const processorCodes = extractAllXmlTags(xml, 'ProcessorResponseCode');

  const lastIndex = transactionResults.length - 1;
  const transactionResult = lastIndex >= 0 ? transactionResults[lastIndex] : extractXmlTag(xml, 'TransactionResult');
  const approvalCode = lastIndex >= 0 ? approvalCodes[lastIndex] : extractXmlTag(xml, 'ApprovalCode');
  const ipgTransactionId = lastIndex >= 0 ? ipgTransactionIds[lastIndex] : extractXmlTag(xml, 'IpgTransactionId');
  const processorResponseCode = lastIndex >= 0 ? processorCodes[lastIndex] : extractXmlTag(xml, 'ProcessorResponseCode');

  return {
    transactionResult,
    approvalCode,
    ipgTransactionId,
    processorResponseCode,
    paymentStatus: mapSipagTransactionResult(transactionResult)
      || (processorResponseCode === '00' ? 'pago' : null),
  };
}
