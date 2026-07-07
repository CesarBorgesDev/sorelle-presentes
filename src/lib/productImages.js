export const MAX_PRODUCT_IMAGES = 6;

export function getProductImages(product) {
  if (!product) return [];

  const combined = [product.image_url, ...(product.images || [])]
    .filter((url) => typeof url === 'string' && url.trim());

  const unique = [];
  for (const url of combined) {
    const trimmed = url.trim();
    if (!unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  }

  return unique.slice(0, MAX_PRODUCT_IMAGES);
}

export function buildProductImagePayload(urls) {
  const cleaned = (urls || [])
    .filter((url) => typeof url === 'string' && url.trim())
    .map((url) => url.trim())
    .slice(0, MAX_PRODUCT_IMAGES);

  return {
    image_url: cleaned[0] || null,
    images: cleaned.slice(1),
  };
}

export function buildInitialProductImages(product) {
  return getProductImages(product);
}
