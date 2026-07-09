import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api } from '@/api/apiClient';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';

function BrandItem({ brand }) {
  const content = brand.logo_url ? (
    <img
      src={resolveMediaUrl(brand.logo_url)}
      alt={brand.name}
      className="h-8 lg:h-10 w-auto max-w-[140px] object-contain opacity-70 hover:opacity-100 transition-opacity"
      loading="lazy"
    />
  ) : (
    <span className="font-display text-xl lg:text-2xl tracking-widest uppercase text-muted-foreground whitespace-nowrap opacity-70 hover:opacity-100 transition-opacity">
      {brand.name}
    </span>
  );

  if (brand.website_url) {
    return (
      <a
        href={brand.website_url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0"
      >
        {content}
      </a>
    );
  }

  return <div className="shrink-0">{content}</div>;
}

export default function BrandsCarousel() {
  const { data: brands = [], isLoading } = useQuery({
    queryKey: ['brands'],
    queryFn: () => api.brands.list(),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || brands.length === 0) {
    return null;
  }

  const items = [...brands, ...brands];

  return (
    <section className="py-14 lg:py-20 border-t border-border overflow-hidden">
      <p className="text-center text-xs tracking-[0.3em] uppercase text-muted-foreground font-body mb-8">
        Marcas Parceiras
      </p>

      <div className="relative w-full overflow-hidden">
        <motion.div
          className="flex gap-16 lg:gap-24 items-center"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 25, ease: 'linear', repeat: Infinity }}
        >
          {items.map((brand, index) => (
            <BrandItem key={`${brand.id}-${index}`} brand={brand} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
