import { useEffect } from 'react';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_TITLE,
  SITE_NAME,
  buildPageTitle,
  toCanonicalUrl,
  truncateText,
} from '@/lib/seo';

function upsertMeta(attr, key, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel, href) {
  if (!href) return;
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function upsertJsonLd(data) {
  const id = 'sorelle-jsonld';
  const existing = document.getElementById(id);
  if (!data) {
    existing?.remove();
    return;
  }
  const payload = Array.isArray(data) ? data : [data];
  let el = existing;
  if (!el) {
    el = document.createElement('script');
    el.id = id;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(payload.length === 1 ? payload[0] : payload);
}

export default function SeoHead({
  title,
  description,
  path,
  image,
  type = 'website',
  noIndex = false,
  jsonLd,
}) {
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    const pageTitle = title ? buildPageTitle(title) : DEFAULT_TITLE;
    const pageDescription = truncateText(description || DEFAULT_DESCRIPTION, 160);
    const canonical = toCanonicalUrl(path || window.location.pathname);
    const robots = noIndex ? 'noindex,nofollow' : 'index,follow';
    const ogImage = image || DEFAULT_OG_IMAGE;

    document.title = pageTitle;
    document.documentElement.lang = 'pt-BR';

    upsertMeta('name', 'description', pageDescription);
    upsertMeta('name', 'robots', robots);
    upsertMeta('name', 'googlebot', robots);
    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:title', pageTitle);
    upsertMeta('property', 'og:description', pageDescription);
    upsertMeta('property', 'og:url', canonical);
    upsertMeta('property', 'og:locale', 'pt_BR');
    upsertMeta('property', 'og:image', ogImage);
    upsertMeta('property', 'og:image:alt', pageTitle);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', pageTitle);
    upsertMeta('name', 'twitter:description', pageDescription);
    upsertMeta('name', 'twitter:image', ogImage);
    upsertLink('canonical', canonical);
    upsertJsonLd(jsonLdKey ? JSON.parse(jsonLdKey) : null);

    return () => {
      upsertJsonLd(null);
    };
  }, [title, description, path, image, type, noIndex, jsonLdKey]);

  return null;
}
