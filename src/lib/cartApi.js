import { api } from '@/api/apiClient';
import { guestCart } from '@/lib/guestCart';

function hasToken() {
  return Boolean(api.auth.getToken());
}

function clearInvalidToken() {
  api.auth.setToken(null);
}

function isUnauthorized(err) {
  return err?.status === 401 || err?.status === 403;
}

export const cartApi = {
  async list() {
    if (!hasToken()) {
      return guestCart.list();
    }
    try {
      const items = await api.entities.CartItem.list();
      return Array.isArray(items) ? items : [];
    } catch (err) {
      if (isUnauthorized(err)) {
        clearInvalidToken();
        return guestCart.list();
      }
      throw err;
    }
  },

  async create(data) {
    if (!hasToken()) {
      return guestCart.add(data);
    }
    try {
      return await api.entities.CartItem.create(data);
    } catch (err) {
      if (isUnauthorized(err)) {
        clearInvalidToken();
        return guestCart.add(data);
      }
      throw err;
    }
  },

  async update(id, data) {
    if (!hasToken()) {
      return guestCart.update(id, data);
    }
    try {
      return await api.entities.CartItem.update(id, data);
    } catch (err) {
      if (isUnauthorized(err)) {
        clearInvalidToken();
        return guestCart.update(id, data);
      }
      throw err;
    }
  },

  async delete(id) {
    if (!hasToken()) {
      return guestCart.remove(id);
    }
    try {
      return await api.entities.CartItem.delete(id);
    } catch (err) {
      if (isUnauthorized(err)) {
        clearInvalidToken();
        return guestCart.remove(id);
      }
      throw err;
    }
  },

  async mergeGuestCartToServer() {
    const guestItems = guestCart.list();
    if (!guestItems.length) return;

    for (const item of guestItems) {
      await api.entities.CartItem.create({
        product_id: item.product_id,
        product_name: item.product_name,
        product_image: item.product_image,
        price: item.price,
        quantity: item.quantity || 1,
        wrapping: item.wrapping || 'none',
        variant_color: item.variant_color || null,
        variant_size: item.variant_size || null,
      });
    }

    guestCart.clear();
  },
};
