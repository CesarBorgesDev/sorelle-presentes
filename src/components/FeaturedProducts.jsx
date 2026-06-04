import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import ProductCard from './ProductCard';

export default function FeaturedProducts({ products, title, subtitle, link }) {
  if (!products || products.length === 0) return null;

  return (
    <section className="py-20 lg:py-28 px-6 lg:px-16">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-col lg:flex-row lg:items-end lg:justify-between mb-12 lg:mb-16"
        >
          <div>
            {subtitle && (
              <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground font-body mb-3">
                {subtitle}
              </p>
            )}
            <h2 className="font-display text-3xl lg:text-4xl tracking-wider text-foreground">
              {title}
            </h2>
          </div>
          {link && (
            <Link
              to={link}
              className="mt-4 lg:mt-0 inline-flex items-center gap-2 text-sm font-body tracking-wider text-primary hover:opacity-70 transition-opacity uppercase"
            >
              Ver Todos <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </motion.div>

        {/* Asymmetric Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-12 gap-4 lg:gap-6">
          {products.slice(0, 4).map((product, index) => {
            const spans = ['lg:col-span-4', 'lg:col-span-3', 'lg:col-span-3', 'lg:col-span-2'];
            return (
              <ProductCard
                key={product.id}
                product={product}
                className={`col-span-1 ${spans[index] || 'lg:col-span-3'}`}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}