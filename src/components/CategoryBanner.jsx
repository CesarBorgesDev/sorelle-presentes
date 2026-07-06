import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';

export default function CategoryBanner({ categoryKey, banner, reverse = false }) {
  if (!banner) return null;

  const layoutReverse = banner.reverse ?? reverse;

  return (
    <section className="py-8 lg:py-0">
      <div className={`grid grid-cols-1 lg:grid-cols-2 min-h-[60vh] ${layoutReverse ? 'lg:direction-rtl' : ''}`}>
        <motion.div
          initial={{ opacity: 0, x: layoutReverse ? 30 : -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className={`relative overflow-hidden ${layoutReverse ? 'lg:order-2' : 'lg:order-1'}`}
        >
          <img
            src={resolveMediaUrl(banner.image)}
            alt={banner.title}
            className="w-full h-64 lg:h-full object-cover"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: layoutReverse ? -30 : 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className={`flex items-center px-8 lg:px-16 py-12 lg:py-0 ${layoutReverse ? 'lg:order-1' : 'lg:order-2'}`}
        >
          <div className="max-w-md">
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground font-body mb-4">
              Coleção
            </p>
            <h2 className="font-display text-3xl lg:text-5xl tracking-wider text-foreground mb-6">
              {banner.title}
            </h2>
            <p className="font-body text-base text-muted-foreground leading-relaxed mb-8">
              {banner.description}
            </p>
            <Link
              to={`/categoria/${categoryKey}`}
              className="inline-flex items-center gap-3 bg-foreground text-background px-8 py-3.5 rounded-sm font-body text-sm tracking-wider uppercase hover:opacity-80 transition-opacity"
            >
              Explorar <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
