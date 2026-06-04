import React from 'react';
import { motion } from 'framer-motion';
import { Gift } from 'lucide-react';

export default function GiftBanner() {
  return (
    <section className="py-20 lg:py-28 px-6 lg:px-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-4xl mx-auto text-center"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-8">
          <Gift className="w-7 h-7 text-primary" />
        </div>
        <h2 className="font-display text-3xl lg:text-4xl tracking-wider text-foreground mb-6">
          Concierge de Presentes
        </h2>
        <p className="font-body text-base lg:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-8">
          Cada presente Sorelle é embalado com cuidado artesanal. Escolha entre nossa embalagem 
          Kraft Minimalista ou a exclusiva Sorelle Signature para tornar cada momento inesquecível.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <div className="flex items-center gap-3 px-6 py-3 bg-secondary rounded-sm">
            <div className="w-3 h-3 rounded-full bg-primary/60" />
            <span className="font-body text-sm text-foreground">Kraft Minimalista — R$ 12,90</span>
          </div>
          <div className="flex items-center gap-3 px-6 py-3 bg-secondary rounded-sm">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="font-body text-sm text-foreground">Sorelle Signature — R$ 29,90</span>
          </div>
        </div>
      </motion.div>
    </section>
  );
}