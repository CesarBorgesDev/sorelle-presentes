import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShoppingBag } from 'lucide-react';
import ProductImage from '@/components/ProductImage';
import { getProductImages } from '@/lib/productImages';
import { getVariantPriceRange } from '@/lib/productVariants';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';

function formatMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

export default function ProductCard({ product, className = '' }) {
  const priceRange = getVariantPriceRange(product);
  const displayPrice = priceRange.fromLabel ? priceRange.min : product.price;
  const discount = !priceRange.fromLabel && product.original_price
    ? Math.round((1 - product.price / product.original_price) * 100)
    : 0;

  const images = getProductImages(product).map(resolveMediaUrl);
  const hoverImage = images.length > 1 ? images[1] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.6 }}
      className={`group ${className}`}
    >
      <Link to={`/produto/${product.id}`} className="block">
        <div className="relative overflow-hidden rounded-sm aspect-[4/5] bg-secondary">
          <ProductImage
            src={images[0] || product.image_url}
            alt={product.name}
            className="w-full h-full"
            imgClassName="transition-transform duration-700 group-hover:scale-105"
          />
          {hoverImage && (
            <ProductImage
              src={hoverImage}
              alt={product.name}
              className="absolute inset-0 w-full h-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              imgClassName="transition-transform duration-700 group-hover:scale-105"
            />
          )}
          <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-all duration-500" />

          {discount > 0 && (
            <span className="absolute top-3 left-3 bg-primary text-primary-foreground text-xs font-body tracking-wider px-3 py-1 rounded-sm">
              -{discount}%
            </span>
          )}

          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="absolute bottom-3 right-3 bg-background/90 backdrop-blur-sm p-2.5 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 hover:bg-primary hover:text-primary-foreground"
          >
            <ShoppingBag className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-1.5">
          <h3 className="font-display text-sm lg:text-base text-foreground leading-snug tracking-wide">
            {product.name}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {priceRange.fromLabel && (
              <span className="font-body text-xs text-muted-foreground">A partir de</span>
            )}
            <span className="font-body text-sm font-medium text-foreground">
              {formatMoney(displayPrice)}
            </span>
            {!priceRange.fromLabel && product.original_price && (
              <span className="font-body text-xs text-muted-foreground line-through">
                {formatMoney(product.original_price)}
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
