const STORAGE_KEY = 'sorelle_guest_cart';

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `guest_${crypto.randomUUID()}`;
  }
  return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function readItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const guestCart = {
  list() {
    return readItems();
  },

  add(data) {
    const items = readItems();
    const now = new Date().toISOString();
    const item = {
      id: createId(),
      product_id: data.product_id,
      product_name: data.product_name,
      product_image: data.product_image || null,
      price: Number(data.price) || 0,
      quantity: Math.max(1, Number(data.quantity) || 1),
      wrapping: data.wrapping || 'none',
      variant_color: data.variant_color || null,
      variant_size: data.variant_size || null,
      created_date: now,
      updated_date: now,
    };
    items.unshift(item);
    writeItems(items);
    return item;
  },

  update(id, data) {
    const items = readItems();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      const err = new Error('Item do carrinho não encontrado');
      err.status = 404;
      throw err;
    }
    const current = items[index];
    const updated = {
      ...current,
      ...data,
      id: current.id,
      product_id: current.product_id,
      quantity: data.quantity !== undefined
        ? Math.max(1, Number(data.quantity) || 1)
        : current.quantity,
      updated_date: new Date().toISOString(),
    };
    items[index] = updated;
    writeItems(items);
    return updated;
  },

  remove(id) {
    const items = readItems();
    const next = items.filter((item) => item.id !== id);
    if (next.length === items.length) {
      const err = new Error('Item do carrinho não encontrado');
      err.status = 404;
      throw err;
    }
    writeItems(next);
    return { id };
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },
};
