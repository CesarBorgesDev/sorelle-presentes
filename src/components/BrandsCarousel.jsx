import React from 'react';
import { motion } from 'framer-motion';

const BRANDS = [
  'Buddemeyer',
  'Altenburg',
  'Karsten',
  'Trousseau',
  'Artex',
  'Mundo do Enxoval',
  'Zelo',
  'mmartan',
  'Casa Moysés',
  'Santista',
  'Scavone',
  'Trussardi',
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
          className="flex gap-16 lg:gap-24 items-center"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 25, ease: 'linear', repeat: Infinity }}
        >
          {items.map((brand, index) => (
            <span
              key={`${brand}-${index}`}
              className="font-display text-xl lg:text-2xl tracking-widest uppercase text-muted-foreground whitespace-nowrap opacity-70 hover:opacity-100 transition-opacity"
            >
              {brand}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}