import { getSetting, setSetting } from './settings.js';

export const HOME_BANNERS_KEY = 'home_banners';

const DEFAULT_HERO_SLIDES = [
  {
    key: 'casa',
    label: 'Casa',
    path: '/categoria/casa',
    image: 'https://media.api.com/images/public/6a21b15344a3800af2fdb9ef/940205071_generated_f3e2d298.png',
  },
  {
    key: 'decoracao',
    label: 'Decoração',
    path: '/categoria/decoracao',
    image: 'https://media.api.com/images/public/6a21b15344a3800af2fdb9ef/215deeae0_generated_c3aec0c4.png',
  },
  {
    key: 'fragancias',
    label: 'Fragrâncias',
    path: '/categoria/fragancias',
    image: 'https://media.api.com/images/public/6a21b15344a3800af2fdb9ef/d954b3d6c_generated_61731479.png',
  },
  {
    key: 'cama_mesa_banho',
    label: 'Cama, Mesa & Banho',
    path: '/categoria/cama_mesa_banho',
    image: 'https://media.api.com/images/public/6a21b15344a3800af2fdb9ef/0fe8f6fa0_generated_0f6146fd.png',
  },
];

const DEFAULT_SECTIONS = [
  {
    id: 'decoracao',
    categoryKey: 'decoracao',
    banner: {
      title: 'Decoração',
      description: 'Peças artesanais e escultóricas que contam histórias únicas.',
      image: 'https://media.api.com/images/public/6a21b15344a3800af2fdb9ef/215deeae0_generated_c3aec0c4.png',
      reverse: false,
    },
    featured: {
      title: 'Arte & Forma',
      subtitle: 'Decoração',
      link: '/categoria/decoracao',
    },
  },
  {
    id: 'fragancias',
    categoryKey: 'fragancias',
    banner: {
      title: 'Fragrâncias',
      description: 'Aromas que envolvem cada ambiente em uma experiência sensorial.',
      image: 'https://media.api.com/images/public/6a21b15344a3800af2fdb9ef/d954b3d6c_generated_61731479.png',
      reverse: true,
    },
    featured: {
      title: 'Essências',
      subtitle: 'Fragrâncias',
      link: '/categoria/fragancias',
    },
  },
  {
    id: 'cama_mesa_banho',
    categoryKey: 'cama_mesa_banho',
    banner: {
      title: 'Cama, Mesa & Banho',
      description: 'Tecidos nobres e texturas que acariciam os sentidos.',
      image: 'https://media.api.com/images/public/6a21b15344a3800af2fdb9ef/0fe8f6fa0_generated_0f6146fd.png',
      reverse: false,
    },
    featured: {
      title: 'Texturas & Conforto',
      subtitle: 'Cama, Mesa & Banho',
      link: '/categoria/cama_mesa_banho',
    },
  },
];

export const DEFAULT_HOME_BANNERS = {
  hero: {
    brandTitle: 'Sorelle',
    brandSubtitle: 'Presentes & Decoração',
    slides: DEFAULT_HERO_SLIDES,
  },
  casaFeatured: {
    title: 'Para o Lar',
    subtitle: 'Casa',
    link: '/categoria/casa',
  },
  sections: DEFAULT_SECTIONS,
  giftAfterSectionIndex: 1,
};

function sanitizeSlide(slide, fallback) {
  return {
    key: String(slide?.key || fallback?.key || '').trim() || fallback.key,
    label: String(slide?.label || fallback?.label || '').trim() || fallback.label,
    path: String(slide?.path || fallback?.path || '').trim() || fallback.path,
    image: String(slide?.image || fallback?.image || '').trim() || fallback.image,
  };
}

function sanitizeSection(section, fallback) {
  return {
    id: String(section?.id || fallback?.id || '').trim() || fallback.id,
    categoryKey: String(section?.categoryKey || fallback?.categoryKey || '').trim() || fallback.categoryKey,
    banner: {
      title: String(section?.banner?.title || fallback?.banner?.title || '').trim(),
      description: String(section?.banner?.description || fallback?.banner?.description || '').trim(),
      image: String(section?.banner?.image || fallback?.banner?.image || '').trim(),
      reverse: Boolean(section?.banner?.reverse ?? fallback?.banner?.reverse),
    },
    featured: {
      title: String(section?.featured?.title || fallback?.featured?.title || '').trim(),
      subtitle: String(section?.featured?.subtitle || fallback?.featured?.subtitle || '').trim(),
      link: String(section?.featured?.link || fallback?.featured?.link || '').trim(),
    },
  };
}

export function normalizeHomeBanners(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};

  const heroSlides = Array.isArray(source.hero?.slides) && source.hero.slides.length > 0
    ? source.hero.slides.map((slide, index) => sanitizeSlide(slide, DEFAULT_HERO_SLIDES[index] || DEFAULT_HERO_SLIDES[0]))
    : DEFAULT_HERO_SLIDES;

  const sections = Array.isArray(source.sections) && source.sections.length > 0
    ? source.sections.map((section, index) => sanitizeSection(section, DEFAULT_SECTIONS[index] || DEFAULT_SECTIONS[0]))
    : DEFAULT_SECTIONS;

  const giftAfterSectionIndex = Number.isInteger(source.giftAfterSectionIndex)
    ? Math.max(-1, Math.min(sections.length - 1, source.giftAfterSectionIndex))
    : DEFAULT_HOME_BANNERS.giftAfterSectionIndex;

  return {
    hero: {
      brandTitle: String(source.hero?.brandTitle || DEFAULT_HOME_BANNERS.hero.brandTitle).trim(),
      brandSubtitle: String(source.hero?.brandSubtitle || DEFAULT_HOME_BANNERS.hero.brandSubtitle).trim(),
      slides: heroSlides,
    },
    casaFeatured: {
      title: String(source.casaFeatured?.title || DEFAULT_HOME_BANNERS.casaFeatured.title).trim(),
      subtitle: String(source.casaFeatured?.subtitle || DEFAULT_HOME_BANNERS.casaFeatured.subtitle).trim(),
      link: String(source.casaFeatured?.link || DEFAULT_HOME_BANNERS.casaFeatured.link).trim(),
    },
    sections,
    giftAfterSectionIndex,
  };
}

export async function getHomeBanners() {
  const raw = await getSetting(HOME_BANNERS_KEY);
  if (!raw) {
    return normalizeHomeBanners(DEFAULT_HOME_BANNERS);
  }

  try {
    return normalizeHomeBanners(JSON.parse(raw));
  } catch {
    return normalizeHomeBanners(DEFAULT_HOME_BANNERS);
  }
}

export async function updateHomeBanners(payload) {
  const normalized = normalizeHomeBanners(payload);
  await setSetting(HOME_BANNERS_KEY, JSON.stringify(normalized));
  return normalized;
}
