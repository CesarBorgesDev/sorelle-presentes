export const DEFAULT_HOME_BANNERS = {
  hero: {
    brandTitle: 'Sorelle',
    brandSubtitle: 'Presentes & Decoração',
    slides: [
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
    ],
  },
  casaFeatured: {
    title: 'Para o Lar',
    subtitle: 'Casa',
    link: '/categoria/casa',
  },
  sections: [
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
  ],
  giftAfterSectionIndex: 1,
};
