import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';
import { DEFAULT_HOME_BANNERS } from '@/lib/homeBannersDefaults';

export default function HeroSection({ config }) {
  const hero = config?.hero || DEFAULT_HOME_BANNERS.hero;
  const slides = hero.slides?.length ? hero.slides : DEFAULT_HOME_BANNERS.hero.slides;
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <section className="relative h-screen w-full overflow-hidden">
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
            src={resolveMediaUrl(slides[activeIndex]?.image)}
            alt={slides[activeIndex]?.label || 'Sorelle'}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60" />
        </motion.div>
      </AnimatePresence>

      <div className="relative z-10 h-full flex flex-col justify-end pb-16 lg:pb-24 px-6 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="mb-12 lg:mb-16"
        >
          <h1 className="font-display text-white text-4xl md:text-6xl lg:text-7xl tracking-widest leading-tight">
            {hero.brandTitle}
            <span className="block text-lg md:text-xl lg:text-2xl tracking-widest opacity-80 mt-2 font-body font-light">
              {hero.brandSubtitle}
            </span>
          </h1>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 max-w-5xl w-full">
          {slides.map((cat, index) => (
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
                className={`border border-white/30 rounded-sm px-5 py-4 lg:px-8 lg:py-5 transition-all duration-500 whitespace-nowrap flex flex-col items-center text-center
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