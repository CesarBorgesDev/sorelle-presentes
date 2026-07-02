import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { Loader2, ArrowLeft } from 'lucide-react';
import { api } from '@/api/apiClient';

export default function InstitutionalPage({ pageSlug }) {
  const { slug: paramSlug } = useParams();
  const slug = pageSlug || paramSlug;

  const { data: page, isLoading, error } = useQuery({
    queryKey: ['content-page', slug],
    queryFn: () => api.pages.get(slug),
    enabled: Boolean(slug),
  });

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center pt-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center pt-24 px-6 text-center">
        <h1 className="font-display text-2xl text-foreground mb-4">Página não encontrada</h1>
        <Link to="/" className="font-body text-sm text-primary hover:underline inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Voltar à loja
        </Link>
      </div>
    );
  }

  return (
    <div className="pt-20 lg:pt-24 pb-20 lg:pb-28">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-3xl mx-auto px-6 lg:px-8"
      >
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-body text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar à loja
        </Link>

        <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground font-body mb-3">
          Institucional
        </p>
        <h1 className="font-display text-3xl lg:text-5xl tracking-wider text-foreground mb-10">
          {page.title}
        </h1>

        <article className="institutional-content font-body text-foreground/90 leading-relaxed space-y-4">
          <ReactMarkdown
            components={{
              h2: ({ children }) => (
                <h2 className="font-display text-xl tracking-wide text-foreground mt-10 mb-4 first:mt-0">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="font-display text-lg text-foreground mt-8 mb-3">{children}</h3>
              ),
              p: ({ children }) => <p className="text-muted-foreground mb-4">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-6 space-y-2 text-muted-foreground mb-4">{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              strong: ({ children }) => <strong className="font-medium text-foreground">{children}</strong>,
              a: ({ href, children }) => (
                <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {page.content}
          </ReactMarkdown>
        </article>
      </motion.div>
    </div>
  );
}
