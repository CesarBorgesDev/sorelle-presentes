import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

const categories = [
  { key: 'casa', label: 'Casa', path: '/categoria/casa', image: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/940205071_generated_f3e2d298.png' },
  { key: 'decoracao', label: 'Decoração', path: '/categoria/decoracao', image: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/215deeae0_generated_c3aec0c4.png' },
  { key: 'fragancias', label: 'Fragrâncias', path: '/categoria/fragancias', image: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/d954b3d6c_generated_61731479.png' },
  { key: 'cama_mesa_banho', label: 'Cama, Mesa & Banho', path: '/categoria/cama_mesa_banho', image: 'https://media.base44.com/images/public/6a21b15344a3800af2fdb9ef/0fe8f6fa0_generated_0f6146fd.png' },
];

export default function HeroSection() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <section className="relative h-screen w-full overflow-hidden">
      {/* Background Images */}
      <AnimatePresence mode="sync">
        <motion.div
          key={activeIndex}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
          className="absolute inset-0"
        >
          <img
            src={categories[activeIndex].image}
            alt={categories[activeIndex].label}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60" />
        </motion.div>
      </AnimatePresence>

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col justify-end pb-16 lg:pb-24 px-6 lg:px-16">
        {/* Brand Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="mb-12 lg:mb-16"
        >
          <h1 className="font-display text-white text-4xl md:text-6xl lg:text-7xl tracking-widest leading-tight">
            Sorelle
            <span className="block text-lg md:text-xl lg:text-2xl tracking-widest opacity-80 mt-2 font-body font-light">
              Presentes & Decoração
            </span>
          </h1>
        </motion.div>

        {/* Category Navigation */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 max-w-5xl w-full">
          {categories.map((cat, index) => (
            <Link
              key={cat.key}
              to={cat.path}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              className="group"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.1, duration: 0.6 }}
                className={`border border-white/30 rounded-sm px-5 py-4 lg:px-8 lg:py-5 transition-all duration-500 whitespace-nowrap
                  ${activeIndex === index ? 'bg-white/20 backdrop-blur-sm border-white/60' : 'hover:bg-white/10 hover:border-white/50'}`}
              >
                <span className="font-display text-white text-sm lg:text-base tracking-widest uppercase block">
                  {cat.label}
                </span>
                <ArrowRight className={`w-4 h-4 text-white mt-2 transition-all duration-300 ${
                  activeIndex === index ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
                }`} />
              </motion.div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}