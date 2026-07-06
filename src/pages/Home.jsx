import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { DEFAULT_HOME_BANNERS } from '@/lib/homeBannersDefaults';
import HeroSection from '../components/HeroSection';
import FeaturedProducts from '../components/FeaturedProducts';
import CategoryBanner from '../components/CategoryBanner';
import GiftBanner from '../components/GiftBanner';

export default function Home() {
  const { data: banners = DEFAULT_HOME_BANNERS } = useQuery({
    queryKey: ['home-banners'],
    queryFn: () => api.homeBanners.get(),
    staleTime: 60_000,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.entities.Product.list('-created_date', 50),
  });

  const productsByCategory = products.reduce((acc, product) => {
    if (!acc[product.category]) {
      acc[product.category] = [];
    }
    acc[product.category].push(product);
    return acc;
  }, {});

  const casaFeatured = banners.casaFeatured || DEFAULT_HOME_BANNERS.casaFeatured;
  const sections = banners.sections?.length ? banners.sections : DEFAULT_HOME_BANNERS.sections;
  const giftAfterSectionIndex = Number.isInteger(banners.giftAfterSectionIndex)
    ? banners.giftAfterSectionIndex
    : DEFAULT_HOME_BANNERS.giftAfterSectionIndex;

  return (
    <div>
      <HeroSection config={banners} />

      <FeaturedProducts
        products={productsByCategory.casa || []}
        title={casaFeatured.title}
        subtitle={casaFeatured.subtitle}
        link={casaFeatured.link}
      />

      {sections.map((section, index) => (
        <React.Fragment key={section.id}>
          <CategoryBanner
            categoryKey={section.categoryKey}
            banner={section.banner}
          />
          <FeaturedProducts
            products={productsByCategory[section.categoryKey] || []}
            title={section.featured.title}
            subtitle={section.featured.subtitle}
            link={section.featured.link}
          />
          {index === giftAfterSectionIndex && <GiftBanner />}
        </React.Fragment>
      ))}
    </div>
  );
}
