import { api } from '@/api/apiClient';
import { guestCart } from '@/lib/guestCart';

function isAuthenticated() {
  return Boolean(api.auth.getToken());
}

export const cartApi = {
  async list() {
    if (isAuthenticated()) {
      return api.entities.CartItem.list();
    }
    return guestCart.list();
  },

  async create(data) {
    if (isAuthenticated()) {
      return api.entities.CartItem.create(data);
    }
    return guestCart.add(data);
  },

  async update(id, data) {
    if (isAuthenticated()) {
      return api.entities.CartItem.update(id, data);
    }
    return guestCart.update(id, data);
  },

  async delete(id) {
    if (isAuthenticated()) {
      return api.entities.CartItem.delete(id);
    }
    return guestCart.remove(id);
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
