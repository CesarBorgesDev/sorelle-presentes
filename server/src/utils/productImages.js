export const MAX_PRODUCT_IMAGES = 6;

export function normalizeProductImages({ image_url, images }) {
  const combined = [];

  if (typeof image_url === 'string' && image_url.trim()) {
    combined.push(image_url.trim());
  }

  if (Array.isArray(images)) {
    for (const image of images) {
      if (typeof image === 'string' && image.trim()) {
        combined.push(image.trim());
      }
    }
  }

  const unique = [];
  for (const url of combined) {
    if (!unique.includes(url)) {
      unique.push(url);
    }
  }

  const limited = unique.slice(0, MAX_PRODUCT_IMAGES);

  return {
    image_url: limited[0] || null,
    images: limited.slice(1),
  };
}
