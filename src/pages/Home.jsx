import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import HeroSection from '../components/HeroSection';
import FeaturedProducts from '../components/FeaturedProducts';
import CategoryBanner from '../components/CategoryBanner';
import GiftBanner from '../components/GiftBanner';

export default function Home() {
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.entities.Product.list('-created_date', 50),
  });

  const casaProducts = products.filter(p => p.category === 'casa');
  const decoracaoProducts = products.filter(p => p.category === 'decoracao');
  const fraganciasProducts = products.filter(p => p.category === 'fragancias');
  const cmProducts = products.filter(p => p.category === 'cama_mesa_banho');

  return (
    <div>
      <HeroSection />

      <FeaturedProducts
        products={casaProducts}
        title="Para o Lar"
        subtitle="Casa"
        link="/categoria/casa"
      />

      <CategoryBanner categoryKey="decoracao" />

      <FeaturedProducts
        products={decoracaoProducts}
        title="Arte & Forma"
        subtitle="Decoração"
        link="/categoria/decoracao"
      />

      <CategoryBanner categoryKey="fragancias" reverse />

      <FeaturedProducts
        products={fraganciasProducts}
        title="Essências"
        subtitle="Fragrâncias"
        link="/categoria/fragancias"
      />

      <GiftBanner />

      <CategoryBanner categoryKey="cama_mesa_banho" />

      <FeaturedProducts
        products={cmProducts}
        title="Texturas & Conforto"
        subtitle="Cama, Mesa & Banho"
        link="/categoria/cama_mesa_banho"
      />
    </div>
  );
}