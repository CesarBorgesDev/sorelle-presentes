export function formatCurrency(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}

export function computeKitPricing(kit, allProducts = []) {
  const productsTotal = allProducts.reduce((sum, product) => sum + (Number(product.price) || 0), 0);
  const kitPrice = kit?.price != null ? Number(kit.price) : null;
  const referencePrice = kit?.original_price != null
    ? Number(kit.original_price)
    : productsTotal;

  let discountAmount = null;
  let discountPercent = null;

  if (kitPrice != null && referencePrice > kitPrice) {
    discountAmount = Math.round((referencePrice - kitPrice) * 100) / 100;
    discountPercent = referencePrice > 0
      ? Math.round((discountAmount / referencePrice) * 100)
      : 0;
  }

  return {
    productsTotal: Math.round(productsTotal * 100) / 100,
    kitPrice,
    referencePrice: Math.round(referencePrice * 100) / 100,
    discountAmount,
    discountPercent,
  };
}

export function getKitItemPrices(allProducts, kitPrice) {
  const productsTotal = allProducts.reduce((sum, product) => sum + (Number(product.price) || 0), 0);

  if (kitPrice == null || productsTotal <= 0) {
    return allProducts.map((product) => ({
      product,
      cartPrice: Number(product.price) || 0,
    }));
  }

  const ratio = kitPrice / productsTotal;

  return allProducts.map((product) => ({
    product,
    cartPrice: Math.round((Number(product.price) || 0) * ratio * 100) / 100,
  }));
}
