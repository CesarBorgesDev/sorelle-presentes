import React from 'react';
import { motion } from 'framer-motion';
import WhatsAppIcon from './WhatsAppIcon';

const WHATSAPP_GROUP_URL = 'https://chat.whatsapp.com/CCLq572FAkJAQtEYzKj8UB?mode=gi_t';

export default function WhatsAppGroupBanner() {
  return (
    <section className="border-t border-border bg-secondary/30">
      <div className="max-w-7xl mx-auto px-6 lg:px-16 py-14 lg:py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto text-center"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-6">
            <WhatsAppIcon className="w-7 h-7" />
          </div>

          <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground font-body mb-3">
            Comunidade exclusiva
          </p>

          <h2 className="font-display text-2xl lg:text-3xl tracking-wider text-foreground mb-4">
            Grupo Secreto Sorelle Presentes
          </h2>

          <p className="font-body text-sm lg:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto mb-8">
            Entre no nosso grupo no WhatsApp e receba novidades, ofertas especiais
            e curadoria de presentes antes de todo mundo.
          </p>

          <a
            href={WHATSAPP_GROUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-primary text-primary-foreground font-body text-sm tracking-wider uppercase rounded-sm hover:opacity-90 transition-opacity"
          >
            <WhatsAppIcon className="w-4 h-4" />
            Entrar no grupo
          </a>
        </motion.div>
      </div>
    </section>
  );
}
