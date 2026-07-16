import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { DEFAULT_HOME_BANNERS } from '@/lib/homeBannersDefaults';
import { groupProductsByParentCategory, useCategoriesFlat } from '@/hooks/useCategories';
import HeroSection from '../components/HeroSection';
import FeaturedProducts from '../components/FeaturedProducts';
import CategoryBanner from '../components/CategoryBanner';
import BrandsCarousel from '../components/BrandsCarousel';
import WhatsAppGroupBanner from '../components/WhatsAppGroupBanner';

export default function Home() {
  const { data: banners = DEFAULT_HOME_BANNERS } = useQuery({
    queryKey: ['home-banners'],
    queryFn: () => api.homeBanners.get(),
    staleTime: 60_000,
  });

  const { data: products = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products', 'public-home'],
    queryFn: () => api.entities.Product.list('-created_date', 50),
    staleTime: 60_000,
    retry: 2,
  });

  const { data: flatCategories = [] } = useCategoriesFlat();

  const productsByCategory = useMemo(
    () => groupProductsByParentCategory(products, flatCategories),
    [products, flatCategories]
  );

  const casaFeatured = banners.casaFeatured || DEFAULT_HOME_BANNERS.casaFeatured;
  const sections = banners.sections?.length ? banners.sections : DEFAULT_HOME_BANNERS.sections;

  const hasVisibleProducts = Object.values(productsByCategory).some((items) => items.length > 0);

  return (
    <div>
      <HeroSection config={banners} />

      <FeaturedProducts
        products={productsByCategory.casa || []}
        title={casaFeatured.title}
        subtitle={casaFeatured.subtitle}
        link={casaFeatured.link}
      />

      {sections.map((section) => (
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
        </React.Fragment>
      ))}

      {!isLoadingProducts && !hasVisibleProducts && products.length > 0 && (
        <FeaturedProducts
          products={products}
          title="Nossa Coleção"
          subtitle="Destaques"
          link="/busca"
        />
      )}

      <BrandsCarousel />
      <WhatsAppGroupBanner />
    </div>
  );
}
