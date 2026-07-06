import { getApiBase } from '@/api/apiClient';

export function resolveMediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }

  if (url.startsWith('/api/')) {
    const apiBase = getApiBase();
    if (apiBase.startsWith('http')) {
      const origin = apiBase.replace(/\/api\/?$/, '');
      return `${origin}${url}`;
    }
  }

  return url;
}
