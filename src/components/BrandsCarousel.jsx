import React from 'react';
import { motion } from 'framer-motion';

const BRANDS = [
  { name: 'Maison Lumière', logo: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/d0decc38a_generated_image.png' },
  { name: 'Terra Nova', logo: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/4af4b8f81_generated_image.png' },
  { name: 'Casa Alvorada', logo: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/b13b3d05d_generated_image.png' },
  { name: 'Étoile Home', logo: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/f80d556cc_generated_image.png' },
  { name: 'Nordique', logo: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/76c2d57a6_generated_image.png' },
  { name: 'Vento Sul', logo: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/3ce642ac2_generated_image.png' },
  { name: 'Bruma Studio', logo: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/a6d248cfa_generated_image.png' },
  { name: 'Cristal & Cia', logo: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/4d6b8286a_generated_image.png' },
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
            <img
              key={`${brand.name}-${index}`}
              src={brand.logo}
              alt={brand.name}
              className="h-14 lg:h-16 w-auto object-contain shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}