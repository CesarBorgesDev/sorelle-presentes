export const DEFAULT_HOME_BANNERS = {
  hero: {
    brandTitle: 'Sorelle',
    brandSubtitle: 'Presentes & Decoração',
    slides: [
      {
        key: 'casa',
        label: 'Casa',
        path: '/categoria/casa',
        title: 'Para o lar que inspira',
        subtitle: 'Presentes e peças que transformam ambientes',
        image: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/b0b1ab800_generated_image.png',
      },
      {
        key: 'decoracao',
        label: 'Decoração',
        path: '/categoria/decoracao',
        title: 'Arte em cada detalhe',
        subtitle: 'Peças artesanais e escultóricas com história',
        image: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/cba61c4a7_generated_image.png',
      },
      {
        key: 'fragancias',
        label: 'Fragrâncias',
        path: '/categoria/fragancias',
        title: 'Aromas que envolvem',
        subtitle: 'Essências para tornar cada momento memorável',
        image: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/336a68e1d_generated_image.png',
      },
      {
        key: 'cama_mesa_banho',
        label: 'Cama, Mesa & Banho',
        path: '/categoria/cama_mesa_banho',
        title: 'Conforto e textura',
        subtitle: 'Tecidos nobres para o dia a dia',
        image: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/2f651059e_generated_image.png',
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
        subtitle: 'Coleção',
        description: 'Peças artesanais e escultóricas que contam histórias únicas.',
        image: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/cba61c4a7_generated_image.png',
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
        subtitle: 'Coleção',
        description: 'Aromas que envolvem cada ambiente em uma experiência sensorial.',
        image: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/336a68e1d_generated_image.png',
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
        subtitle: 'Coleção',
        description: 'Tecidos nobres e texturas que acariciam os sentidos.',
        image: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/2f651059e_generated_image.png',
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
