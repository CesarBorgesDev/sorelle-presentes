const TOKEN_KEY = 'sorelle_access_token';

function resolveApiBase() {
  if (typeof window !== 'undefined') {
    const runtimeApi = window.__SORELLE_API_URL__?.trim();
    if (runtimeApi) {
      return runtimeApi.replace(/\/$/, '');
    }
  }

  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }

  return '/api';
}

export function getApiBase() {
  return resolveApiBase();
}

class ApiError extends Error {
  constructor(message, status, details = {}) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
    this.path = details.path ?? null;
    this.url = details.url ?? null;
    this.body = details.body ?? null;
    this.rawBody = details.rawBody ?? null;
  }
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  const apiBase = getApiBase();
  const requestUrl = `${apiBase}${path}`;
  try {
    response = await fetch(requestUrl, {
      ...options,
      headers,
    });
  } catch (networkErr) {
    const err = new ApiError(
      `Não foi possível conectar ao servidor (${requestUrl}). Verifique se a API está online, se o SSL de api.sorellepresentes.com.br está ativo no aaPanel e se o Nginx faz proxy para a porta 3001.`,
      0,
      { path, url: requestUrl }
    );
    err.cause = networkErr;
    console.error('[Sorelle] Falha de rede na API', { url: requestUrl, apiBase, cause: networkErr });
    throw err;
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    let body = {};
    let rawBody = null;

    if (contentType.includes('application/json')) {
      body = await response.json().catch(() => ({}));
    } else {
      rawBody = await response.text().catch(() => null);
    }

    const fallbackByStatus = {
      401: 'Não autorizado',
      403: 'Acesso negado',
      404: 'Recurso não encontrado',
      409: 'Este e-mail já está cadastrado',
      500: 'Erro interno no servidor',
      502: 'API indisponível — verifique se a URL da API está correta (api.sorellepresentes.com.br ou /api no Nginx)',
      503: 'Servidor temporariamente indisponível',
    };

    throw new ApiError(
      body.message || fallbackByStatus[response.status] || `Erro na requisição (${response.status})`,
      response.status,
      {
        path,
        url: `${getApiBase()}${path}`,
        body: Object.keys(body).length ? body : null,
        rawBody,
      }
    );
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const rawBody = await response.text().catch(() => null);
    throw new ApiError(
      'Resposta inválida da API — confira se o Nginx faz proxy de /api para o backend',
      response.status,
      {
        path,
        url: `${getApiBase()}${path}`,
        rawBody: rawBody?.slice(0, 200) ?? null,
      }
    );
  }

  return response.json();
}

async function apiFetchBlob(path, options = {}) {
  const token = getToken();
  const headers = {
    ...options.headers,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const apiBase = getApiBase();
  const requestUrl = `${apiBase}${path}`;
  let response;
  try {
    response = await fetch(requestUrl, {
      ...options,
      headers,
    });
  } catch (networkErr) {
    const err = new ApiError(
      `Não foi possível conectar ao servidor (${requestUrl}).`,
      0,
      { path, url: requestUrl }
    );
    err.cause = networkErr;
    throw err;
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    let body = {};
    let rawBody = null;

    if (contentType.includes('application/json')) {
      body = await response.json().catch(() => ({}));
    } else {
      rawBody = await response.text().catch(() => null);
    }

    throw new ApiError(
      body.message || `Erro na requisição (${response.status})`,
      response.status,
      { path, url: requestUrl, body: Object.keys(body).length ? body : null, rawBody }
    );
  }

  const blob = await response.blob();
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const disposition = response.headers.get('content-disposition') || '';
  const filenameMatch = disposition.match(/filename="([^"]+)"/);

  return {
    blob,
    contentType,
    filename: filenameMatch?.[1] || null,
  };
}

function createEntityClient(resourcePath) {
  return {
    async list(sort = '-created_date', limit = 100) {
      const params = new URLSearchParams();
      if (sort) params.set('sort', sort);
      if (limit) params.set('limit', String(limit));
      return apiFetch(`/${resourcePath}?${params}`);
    },

    async filter(filters = {}, sort = '-created_date', limit = 100) {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      });
      if (sort) params.set('sort', sort);
      if (limit) params.set('limit', String(limit));
      return apiFetch(`/${resourcePath}/filter?${params}`);
    },

    async create(data) {
      return apiFetch(`/${resourcePath}`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async update(id, data) {
      return apiFetch(`/${resourcePath}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async delete(id) {
      return apiFetch(`/${resourcePath}/${id}`, {
        method: 'DELETE',
      });
    },
  };
}

const auth = {
  getToken,
  setToken,

  async loginViaEmailPassword(email, password) {
    const result = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(result.access_token);
    return result;
  },

  async register({ email, password }) {
    const result = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(result.access_token);
    return result;
  },

  async me() {
    return apiFetch('/auth/me');
  },

  logout(redirectUrl) {
    setToken(null);
    if (redirectUrl) {
      window.location.href = '/login';
    }
  },

  redirectToLogin(returnUrl) {
    const params = returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : '';
    window.location.href = `/login${params}`;
  },

  async resetPasswordRequest(email) {
    return apiFetch('/auth/reset-password-request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword({ resetToken, newPassword }) {
    return apiFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ resetToken, newPassword }),
    });
  },

  loginWithProvider() {
    throw new Error('Login com Google não disponível. Use e-mail e senha.');
  },

  async verifyOtp() {
    throw new Error('Verificação OTP não necessária.');
  },

  async resendOtp() {
    throw new Error('Verificação OTP não necessária.');
  },
};

const settings = {
  async get() {
    return apiFetch('/settings');
  },

  async getPublic() {
    return apiFetch('/settings/public');
  },

  async update(data) {
    return apiFetch('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

const pages = {
  get(slug) {
    return apiFetch(`/pages/${slug}`);
  },

  list() {
    return apiFetch('/pages');
  },

  update(slug, data) {
    return apiFetch(`/pages/${slug}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

const homeBanners = {
  get() {
    return apiFetch('/home-banners');
  },

  update(data) {
    return apiFetch('/home-banners', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

const images = {
  async uploadProduct({ image, mime_type }) {
    return apiFetch('/images/upload-product', {
      method: 'POST',
      body: JSON.stringify({ image, mime_type }),
    });
  },

  async generateScene({ image, mime_type, product_name, category, materials }) {
    return apiFetch('/images/generate-scene', {
      method: 'POST',
      body: JSON.stringify({ image, mime_type, product_name, category, materials }),
    });
  },
};

const checkout = {
  async getPaymentConditions() {
    return apiFetch('/checkout/condicoes-pagamento');
  },

  async getMethods(pickup = false) {
    const params = pickup ? '?pickup=true' : '';
    return apiFetch(`/checkout/metodos${params}`);
  },

  async start(data) {
    return apiFetch('/checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async startCielo(data) {
    return apiFetch('/checkout/cielo', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getOrder(orderId) {
    return apiFetch(`/checkout/pedido/${orderId}`);
  },

  async listMyOrders() {
    return apiFetch('/checkout/meus-pedidos');
  },

  async getPixDetails(orderId) {
    return apiFetch(`/checkout/pedido/${orderId}/pix`);
  },

  async trackOrder(orderId) {
    return apiFetch(`/checkout/pedido/${orderId}/rastreio`);
  },

  downloadInvoice(orderId, type) {
    return apiFetchBlob(`/checkout/pedido/${orderId}/nota-fiscal/${type}`);
  },
};

const orderShipping = {
  generateLabel(orderId, data = {}) {
    return apiFetch(`/orders/${orderId}/etiqueta`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  track(orderId) {
    return apiFetch(`/orders/${orderId}/rastreio`);
  },

  generateTrackingCode(orderId) {
    return apiFetch(`/orders/${orderId}/codigo-correios`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  uploadInvoice(orderId, data) {
    return apiFetch(`/orders/${orderId}/nota-fiscal`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  downloadInvoice(orderId, type) {
    return apiFetchBlob(`/orders/${orderId}/nota-fiscal/${type}`);
  },
};

const shipping = {
  async quote(destination_zip) {
    return apiFetch('/shipping/cotacao', {
      method: 'POST',
      body: JSON.stringify({ destination_zip }),
    });
  },

  async quoteProduct(product_id, quantity, destination_zip) {
    return apiFetch('/shipping/cotacao-produto', {
      method: 'POST',
      body: JSON.stringify({
        product_id,
        quantity,
        destination_zip,
      }),
    });
  },

  async lookupCep(cep) {
    return apiFetch(`/shipping/cep/${cep.replace(/\D/g, '')}`);
  },
};

const account = {
  getProfile() {
    return apiFetch('/account/profile');
  },

  updateProfile(data) {
    return apiFetch('/account/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getWishlist() {
    return apiFetch('/account/wishlist');
  },

  addToWishlist(productId) {
    return apiFetch('/account/wishlist', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId }),
    });
  },

  removeFromWishlist(productId) {
    return apiFetch(`/account/wishlist/${productId}`, { method: 'DELETE' });
  },

  getRmaRequests() {
    return apiFetch('/account/rma');
  },

  createRmaRequest(data) {
    return apiFetch('/account/rma', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

export function logApiError(context, err, extra = {}) {
  const details = {
    context,
    message: err?.message ?? String(err),
    name: err?.name ?? null,
    status: err?.status ?? null,
    url: err?.url ?? null,
    path: err?.path ?? null,
    body: err?.body ?? null,
    rawBody: err?.rawBody ?? null,
    cause: err?.cause ?? null,
    ...extra,
  };

  console.error(`[Sorelle] ${context}`, details);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
}

const productsApi = {
  checkInternalCode(code, excludeId) {
    const params = new URLSearchParams();
    if (code?.trim()) params.set('code', code.trim());
    if (excludeId) params.set('exclude_id', excludeId);
    return apiFetch(`/products/internal-code/check?${params}`);
  },
};

const productKitsApi = {
  getByProduct(productId) {
    return apiFetch(`/product-kits/by-product/${productId}`);
  },
  getById(id) {
    return apiFetch(`/product-kits/${id}`);
  },
};

const brandsApi = {
  list(includeInactive = false) {
    const params = new URLSearchParams({ sort: 'sort_order', limit: '100' });
    if (includeInactive) params.set('include_inactive', 'true');
    return apiFetch(`/brands?${params}`);
  },

  create(data) {
    return apiFetch('/brands', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(id, data) {
    return apiFetch(`/brands/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete(id) {
    return apiFetch(`/brands/${id}`, { method: 'DELETE' });
  },
};

const categoriesApi = {
  list(includeInactive = false) {
    const params = new URLSearchParams({ sort: 'sort_order', limit: '100' });
    if (includeInactive) params.set('include_inactive', 'true');
    return apiFetch(`/categories?${params}`);
  },

  create(data) {
    return apiFetch('/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(id, data) {
    return apiFetch(`/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete(id) {
    return apiFetch(`/categories/${id}`, { method: 'DELETE' });
  },
};

export const api = {
  auth,
  settings,
  pages,
  homeBanners,
  images,
  checkout,
  orderShipping,
  shipping,
  account,
  products: productsApi,
  productKits: productKitsApi,
  brands: brandsApi,
  categories: categoriesApi,
  entities: {
    Product: createEntityClient('products'),
    ProductKit: createEntityClient('product-kits'),
    Order: createEntityClient('orders'),
    Affiliate: createEntityClient('affiliates'),
    AffiliateConversion: createEntityClient('affiliate-conversions'),
    CartItem: createEntityClient('cart-items'),
  },
};

export default api;
