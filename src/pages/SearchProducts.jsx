import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '@/api/apiClient';
import { motion } from 'framer-motion';
import ProductCard from '@/components/ProductCard';
import ProductListRow from '@/components/ProductListRow';
import ProductViewToggle, { useProductViewMode } from '@/components/ProductViewToggle';
import { isProductAvailable } from '@/lib/productStock';
import { useProductSortOrder, sortProducts } from '@/hooks/useProductSort';

function normalizeSearchTerm(value) {
  return String(value || '').trim().toLowerCase();
}

function productMatchesQuery(product, query) {
  if (!query) return false;

  const haystack = [
    product.name,
    product.description,
    product.category,
    product.subcategory,
    product.internal_code,
    product.sku,
    product.materials,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}

export default function SearchProducts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef(null);
  const [viewMode, setViewMode] = useProductViewMode('sorelle-search-view');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products-search-catalog'],
    queryFn: () => api.entities.Product.list('-created_date', 500),
  });

  useEffect(() => {
    setQuery(searchParams.get('q') || '');
  }, [searchParams]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const normalizedQuery = normalizeSearchTerm(query);
  const sortOrder = useProductSortOrder();

  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    const matches = products.filter((product) => productMatchesQuery(product, normalizedQuery));
    return sortProducts(matches, sortOrder);
  }, [products, normalizedQuery, sortOrder]);

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      setSearchParams({ q: trimmed });
    } else {
      setSearchParams({});
    }
  }

  return (
    <div className="pt-20 lg:pt-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="px-6 py-10 lg:py-14 border-b border-border"
      >
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground font-body mb-4">
            Busca
          </p>
          <h1 className="font-display text-3xl lg:text-5xl tracking-wider text-foreground mb-6">
            Encontre seu produto
          </h1>

          <form onSubmit={handleSubmit} className="relative max-w-xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, categoria ou código..."
              className="w-full pl-12 pr-4 py-3.5 bg-card border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </form>
        </div>
      </motion.div>

      <div className="px-6 lg:px-16 pb-20 lg:pb-28">
        <div className="max-w-7xl mx-auto">
          {!normalizedQuery ? (
            <div className="text-center py-16 font-body text-muted-foreground">
              Digite o nome do produto e pressione Enter para buscar.
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {Array(8).fill(0).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[4/5] bg-secondary rounded-sm" />
                  <div className="mt-4 space-y-2">
                    <div className="h-3 bg-secondary rounded w-20" />
                    <div className="h-4 bg-secondary rounded w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-16">
              <p className="font-body text-muted-foreground">
                Nenhum produto encontrado para &quot;{query.trim()}&quot;.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 mb-6 mt-8">
                <p className="font-body text-sm text-muted-foreground">
                  {results.length} resultado(s) para &quot;{query.trim()}&quot;
                </p>
                <ProductViewToggle value={viewMode} onChange={setViewMode} />
              </div>

              {viewMode === 'list' ? (
                <div className="space-y-3">
                  {results.map((product) => (
                    <ProductListRow key={product.id} product={product} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                  {results.map((product) => (
                    <div key={product.id} className={!isProductAvailable(product) ? 'opacity-70' : ''}>
                      <ProductCard product={product} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
