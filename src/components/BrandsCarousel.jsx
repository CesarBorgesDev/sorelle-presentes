import React from 'react';
import { motion } from 'framer-motion';

const BRANDS = [
  'Maison Lumière',
  'Terra Nova',
  'Casa Alvorada',
  'Étoile Home',
  'Nordique',
  'Vento Sul',
  'Ateliê Bruma',
  'Cristal & Cia',
];

export default function BrandsCarousel() {
  const items = [...BRANDS, ...BRANDS];

  return (
    <section className="py-14 lg:py-20 border-t border-border overflow-hidden">
      <p className="text-center text-xs tracking-[0.3em] uppercase text-muted-foreground font-body mb-8">
        Marcas Parceiras
      </p>

      <div className="relative w-full overflow-hidden">
        <motion.div
          className="flex gap-16 lg:gap-24 whitespace-nowrap"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 25, ease: 'linear', repeat: Infinity }}
        >
          {items.map((brand, index) => (
            <span
              key={`${brand}-${index}`}
              className="font-display text-xl lg:text-2xl tracking-widest text-muted-foreground/60 shrink-0"
            >
              {brand}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}