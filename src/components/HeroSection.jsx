import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';
import { DEFAULT_HOME_BANNERS } from '@/lib/homeBannersDefaults';

export default function HeroSection({ config }) {
  const hero = config?.hero || DEFAULT_HOME_BANNERS.hero;
  const slides = hero.slides?.length ? hero.slides : DEFAULT_HOME_BANNERS.hero.slides;
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [slides.length]);

  const activeSlide = slides[activeIndex] || {};
  const title = (
    activeSlide.title
    || activeSlide.phrase
    || ''
  ).trim() || hero.brandSubtitle || '';
  const subtitle = (
    activeSlide.subtitle
    || activeSlide.tagline
    || ''
  ).trim();

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
            src={resolveMediaUrl(activeSlide.image)}
            alt={activeSlide.label || 'Sorelle'}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60" />
        </motion.div>
      </AnimatePresence>

      <div className="relative z-10 h-full flex flex-col justify-end pb-16 lg:pb-24 px-6 lg:px-16">
        <div className="max-w-3xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeIndex}-${title}-${subtitle}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              {title && (
                <h1 className="font-display text-white text-4xl md:text-6xl lg:text-7xl tracking-widest leading-tight">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="font-body text-white/75 text-sm md:text-base lg:text-lg tracking-wide mt-3 md:mt-4 max-w-xl">
                  {subtitle}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
