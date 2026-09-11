const SDK_SRC = 'https://sdk.mercadopago.com/js/v2';
const SECURITY_SRC = 'https://www.mercadopago.com/v2/security.js';

let sdkPromise = null;

export function loadMercadoPagoSdk() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('SDK do Mercado Pago só funciona no navegador'));
  }
  if (window.MercadoPago) {
    return Promise.resolve(window.MercadoPago);
  }
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-mp-sdk]');
    if (existing) {
      if (window.MercadoPago) {
        resolve(window.MercadoPago);
        return;
      }
      existing.addEventListener('load', () => resolve(window.MercadoPago), { once: true });
      existing.addEventListener('error', () => {
        sdkPromise = null;
        reject(new Error('Não foi possível carregar o Mercado Pago'));
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = SDK_SRC;
    script.async = true;
    script.dataset.mpSdk = 'true';
    script.onload = () => resolve(window.MercadoPago);
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error('Não foi possível carregar o Mercado Pago'));
    };
    document.head.appendChild(script);
  });

  return sdkPromise;
}

export function loadMercadoPagoSecurity() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('script[data-mp-security]')) return;

  const script = document.createElement('script');
  script.src = SECURITY_SRC;
  script.async = true;
  script.setAttribute('view', 'checkout');
  script.dataset.mpSecurity = 'true';
  document.head.appendChild(script);
}

export function getMercadoPagoDeviceId() {
  if (typeof window === 'undefined') return null;
  return window.MP_DEVICE_SESSION_ID || null;
}

export async function createMercadoPagoInstance(publicKey) {
  const MercadoPago = await loadMercadoPagoSdk();
  if (!MercadoPago) {
    throw new Error('SDK do Mercado Pago indisponível');
  }
  loadMercadoPagoSecurity();
  return new MercadoPago(publicKey, { locale: 'pt-BR' });
}
