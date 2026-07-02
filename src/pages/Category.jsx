import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { motion } from 'framer-motion';
import ProductCard from '../components/ProductCard';
import ProductListRow from '../components/ProductListRow';
import ProductViewToggle, { useProductViewMode } from '../components/ProductViewToggle';

const categoryMeta = {
  casa: { title: 'Casa', description: 'Objetos que transformam seu lar em um refúgio de estilo e conforto.' },
  decoracao: { title: 'Decoração', description: 'Peças artesanais e escultóricas que contam histórias únicas.' },
  fragancias: { title: 'Fragrâncias', description: 'Aromas que envolvem cada ambiente em uma experiência sensorial.' },
  cama_mesa_banho: { title: 'Cama, Mesa & Banho', description: 'Tecidos nobres e texturas que acariciam os sentidos.' },
};

export default function Category() {
  const { slug } = useParams();
  const meta = categoryMeta[slug] || { title: slug, description: '' };
  const [viewMode, setViewMode] = useProductViewMode('sorelle-category-view');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', slug],
    queryFn: () => api.entities.Product.filter({ category: slug }, '-created_date', 50),
  });

  return (
    <div className="pt-20 lg:pt-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center px-6 py-16 lg:py-24"
      >
        <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground font-body mb-4">
          Coleção
        </p>
        <h1 className="font-display text-4xl lg:text-6xl tracking-wider text-foreground mb-4">
          {meta.title}
        </h1>
        <p className="font-body text-base text-muted-foreground max-w-lg mx-auto">
          {meta.description}
        </p>
      </motion.div>

      {/* Products */}
      <div className="px-6 lg:px-16 pb-20 lg:pb-28">
        <div className="max-w-7xl mx-auto">
          {!isLoading && products.length > 0 && (
            <div className="flex items-center justify-between gap-4 mb-6">
              <p className="font-body text-sm text-muted-foreground">
                {products.length} produto(s)
              </p>
              <ProductViewToggle value={viewMode} onChange={setViewMode} />
            </div>
          )}

          {isLoading ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                {Array(8).fill(0).map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-[4/5] bg-secondary rounded-sm" />
                    <div className="mt-4 space-y-2">
                      <div className="h-3 bg-secondary rounded w-20" />
                      <div className="h-4 bg-secondary rounded w-32" />
                      <div className="h-3 bg-secondary rounded w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {Array(4).fill(0).map((_, i) => (
                  <div key={i} className="animate-pulse flex gap-4 p-4 border border-border rounded-sm">
                    <div className="w-28 aspect-[4/5] bg-secondary rounded-sm" />
                    <div className="flex-1 space-y-2 py-2">
                      <div className="h-3 bg-secondary rounded w-24" />
                      <div className="h-5 bg-secondary rounded w-48" />
                      <div className="h-4 bg-secondary rounded w-20" />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : products.length === 0 ? (
            <div className="text-center py-20">
              <p className="font-body text-muted-foreground">Nenhum produto encontrado nesta categoria.</p>
            </div>
          ) : viewMode === 'list' ? (
            <div className="space-y-3">
              {products.map((product) => (
                <ProductListRow key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}