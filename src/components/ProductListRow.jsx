import React from 'react';
import { Link } from 'react-router-dom';
import { isProductAvailable } from '@/lib/productStock';
import ProductImage from '@/components/ProductImage';

export default function ProductListRow({ product, className = '' }) {
  const discount = product.original_price
    ? Math.round((1 - product.price / product.original_price) * 100)
    : 0;

  return (
    <Link
      to={`/produto/${product.id}`}
      className={`group flex gap-4 sm:gap-6 p-3 sm:p-4 border border-border rounded-sm bg-card hover:bg-secondary/30 transition-colors ${className}`}
    >
      <div className="relative w-24 sm:w-32 shrink-0 aspect-[4/5] rounded-sm overflow-hidden bg-secondary">
        {product.image_url ? (
          <ProductImage
            src={product.image_url}
            alt={product.name}
            className="w-full h-full"
          />
        ) : (
          <div className="w-full h-full bg-secondary" />
        )}
        {discount > 0 && (
          <span className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] font-body px-2 py-0.5 rounded-sm">
            -{discount}%
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0 py-1 flex flex-col justify-center">
        <p className="text-xs text-muted-foreground tracking-wider uppercase font-body mb-1">
          {product.subcategory || product.category?.replace(/_/g, ' ')}
        </p>
        <h3 className="font-display text-base sm:text-lg tracking-wide text-foreground leading-snug mb-2">
          {product.name}
        </h3>
        {product.description && (
          <p className="font-body text-sm text-muted-foreground line-clamp-2 mb-2 hidden sm:block">
            {product.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-auto">
          <span className="font-body text-sm font-medium text-foreground">
            R$ {product.price?.toFixed(2).replace('.', ',')}
          </span>
          {product.original_price && (
            <span className="font-body text-xs text-muted-foreground line-through">
              R$ {product.original_price?.toFixed(2).replace('.', ',')}
            </span>
          )}
          {!isProductAvailable(product) && (
            <span className="font-body text-xs text-destructive ml-2">Indisponível</span>
          )}
        </div>
      </div>
    </Link>
  );
}
