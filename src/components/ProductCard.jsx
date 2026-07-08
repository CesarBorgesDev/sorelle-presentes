import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShoppingBag } from 'lucide-react';
import ProductImage from '@/components/ProductImage';

export default function ProductCard({ product, className = '' }) {
  const discount = product.original_price
    ? Math.round((1 - product.price / product.original_price) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.6 }}
      className={`group ${className}`}
    >
      <Link to={`/produto/${product.id}`} className="block">
        {/* Image */}
        <div className="relative overflow-hidden rounded-sm aspect-[4/5] bg-secondary">
          <ProductImage
            src={product.image_url}
            alt={product.name}
            className="w-full h-full"
          />
          {/* Overlay on hover */}
          <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-all duration-500" />

          {/* Discount Badge */}
          {discount > 0 && (
            <span className="absolute top-3 left-3 bg-primary text-primary-foreground text-xs font-body tracking-wider px-3 py-1 rounded-sm">
              -{discount}%
            </span>
          )}

          {/* Quick Add */}
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

        {/* Info */}
        <div className="mt-4 space-y-1.5">
          <p className="text-xs text-muted-foreground tracking-wider uppercase font-body">
            {product.subcategory || product.category?.replace(/_/g, ' ')}
          </p>
          <h3 className="font-display text-sm lg:text-base text-foreground leading-snug tracking-wide">
            {product.name}
          </h3>
          <div className="flex items-center gap-2">
            <span className="font-body text-sm font-medium text-foreground">
              R$ {product.price?.toFixed(2).replace('.', ',')}
            </span>
            {product.original_price && (
              <span className="font-body text-xs text-muted-foreground line-through">
                R$ {product.original_price?.toFixed(2).replace('.', ',')}
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}