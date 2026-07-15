import https from 'node:https';
import { URL } from 'node:url';
import { escapeXml } from '../utils/sipagXml.js';

function buildAuthHeader(userId, userPassword) {
  const token = Buffer.from(`${userId}:${userPassword}`).toString('base64');
  return `Basic ${token}`;
}

export function postSipagSoap(xml, config) {
  const url = new URL(config.apiUrl);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        Authorization: buildAuthHeader(config.userId, config.userPassword),
        'Content-Length': Buffer.byteLength(xml, 'utf8'),
      },
      cert: config.certPem,
      key: config.certKey,
      passphrase: config.certPassword || undefined,
      rejectUnauthorized: config.environment === 'production',
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          body,
        });
      });
    });

    req.on('error', reject);
    req.write(xml);
    req.end();
  });
}

export function buildCreatePaymentUrlXml({ config, amount, pageText }) {
  const chargeTotal = Number(amount).toFixed(2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP-ENV:Header/>
  <SOAP-ENV:Body>
    <ipgapi:IPGApiActionRequest xmlns:ipgapi="http://ipg-online.com/ipgapi/schemas/ipgapi" xmlns:a1="http://ipg-online.com/ipgapi/schemas/a1" xmlns:v1="http://ipg-online.com/ipgapi/schemas/v1">
      <a1:Action>
        <a1:CreatePaymentURL>
          <a1:Transaction>
            <v1:PaymentUrlTxType>
              <v1:StoreId>${escapeXml(config.storeId)}</v1:StoreId>
              <v1:Type>sale</v1:Type>
            </v1:PaymentUrlTxType>
            <v1:Payment>
              <v1:ChargeTotal>${escapeXml(chargeTotal)}</v1:ChargeTotal>
              <v1:Currency>986</v1:Currency>
            </v1:Payment>
            <v1:TransactionDetails>
              <v1:DynamicMerchantName>${escapeXml(config.softDescriptor || 'SORELLE')}</v1:DynamicMerchantName>
            </v1:TransactionDetails>
            <v1:ClientLocale>
              <v1:Language>pt</v1:Language>
              <v1:Country>BR</v1:Country>
            </v1:ClientLocale>
          </a1:Transaction>
          <a1:hostedPaymentPageText>${escapeXml(pageText || 'Pagamento Sorelle Presentes')}</a1:hostedPaymentPageText>
        </a1:CreatePaymentURL>
      </a1:Action>
    </ipgapi:IPGApiActionRequest>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
}

export function buildInquiryOrderXml({ config, orderId }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP-ENV:Header/>
  <SOAP-ENV:Body>
    <ipgapi:IPGApiActionRequest xmlns:ipgapi="http://ipg-online.com/ipgapi/schemas/ipgapi" xmlns:a1="http://ipg-online.com/ipgapi/schemas/a1">
      <a1:Action>
        <a1:InquiryOrder>
          <a1:OrderId>${escapeXml(orderId)}</a1:OrderId>
          <a1:StoreId>${escapeXml(config.storeId)}</a1:StoreId>
        </a1:InquiryOrder>
      </a1:Action>
    </ipgapi:IPGApiActionRequest>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
}
