import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

const categoryData = {
  casa: {
    title: 'Casa',
    description: 'Objetos que transformam seu lar em um refúgio de estilo e conforto.',
    image: 'https://media.api.com/images/public/6a21b15344a3800af2fdb9ef/940205071_generated_f3e2d298.png',
  },
  decoracao: {
    title: 'Decoração',
    description: 'Peças artesanais e escultóricas que contam histórias únicas.',
    image: 'https://media.api.com/images/public/6a21b15344a3800af2fdb9ef/215deeae0_generated_c3aec0c4.png',
  },
  fragancias: {
    title: 'Fragrâncias',
    description: 'Aromas que envolvem cada ambiente em uma experiência sensorial.',
    image: 'https://media.api.com/images/public/6a21b15344a3800af2fdb9ef/d954b3d6c_generated_61731479.png',
  },
  cama_mesa_banho: {
    title: 'Cama, Mesa & Banho',
    description: 'Tecidos nobres e texturas que acariciam os sentidos.',
    image: 'https://media.api.com/images/public/6a21b15344a3800af2fdb9ef/0fe8f6fa0_generated_0f6146fd.png',
  },
};

export default function CategoryBanner({ categoryKey, reverse = false }) {
  const cat = categoryData[categoryKey];
  if (!cat) return null;

  return (
    <section className="py-8 lg:py-0">
      <div className={`grid grid-cols-1 lg:grid-cols-2 min-h-[60vh] ${reverse ? 'lg:direction-rtl' : ''}`}>
        {/* Image */}
        <motion.div
          initial={{ opacity: 0, x: reverse ? 30 : -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className={`relative overflow-hidden ${reverse ? 'lg:order-2' : 'lg:order-1'}`}
        >
          <img
            src={cat.image}
            alt={cat.title}
            className="w-full h-64 lg:h-full object-cover"
          />
        </motion.div>

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, x: reverse ? -30 : 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className={`flex items-center px-8 lg:px-16 py-12 lg:py-0 ${reverse ? 'lg:order-1' : 'lg:order-2'}`}
        >
          <div className="max-w-md">
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground font-body mb-4">
              Coleção
            </p>
            <h2 className="font-display text-3xl lg:text-5xl tracking-wider text-foreground mb-6">
              {cat.title}
            </h2>
            <p className="font-body text-base text-muted-foreground leading-relaxed mb-8">
              {cat.description}
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