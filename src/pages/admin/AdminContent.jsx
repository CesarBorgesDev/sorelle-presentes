import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { FileText, ImageIcon, Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'react-router-dom';
import HomeBannersEditor from './HomeBannersEditor';

const PAGE_TABS = [
  { slug: 'sobre-nos', label: 'Sobre Nós', path: '/sobre-nos' },
  { slug: 'politica-de-privacidade', label: 'Privacidade', path: '/politica-de-privacidade' },
  { slug: 'termos-de-uso', label: 'Termos de Uso', path: '/termos-de-uso' },
  { slug: 'trocas-e-devolucoes', label: 'Trocas e Devoluções', path: '/trocas-e-devolucoes' },
];

function PageEditor({ page, onSave, saving, saved }) {
  const [title, setTitle] = useState(page?.title || '');
  const [content, setContent] = useState(page?.content || '');

  useEffect(() => {
    setTitle(page?.title || '');
    setContent(page?.content || '');
  }, [page]);

  if (!page) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="font-body text-sm text-muted-foreground">
          Use Markdown: <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">## Título</code>, listas com <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">- item</code>, <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">**negrito**</code>.
        </p>
        <Link
          to={PAGE_TABS.find((t) => t.slug === page.slug)?.path || '/'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 font-body text-sm text-primary hover:underline shrink-0"
        >
          Ver na loja
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>

      <div>
        <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">
          Título da página
        </label>
        <input
          className="w-full h-11 px-4 rounded-sm border border-border bg-background font-body text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">
          Conteúdo
        </label>
        <textarea
          className="w-full min-h-[420px] px-4 py-3 rounded-sm border border-border bg-background font-body text-sm leading-relaxed resize-y"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => onSave({ title, content })}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-sm font-body text-sm tracking-wide hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Salvar página
        </button>
        {saved && (
          <span className="inline-flex items-center gap-2 font-body text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="w-4 h-4" />
            Salvo com sucesso
          </span>
        )}
      </div>
    </div>
  );
}

export default function AdminContent() {
  const queryClient = useQueryClient();
  const [mainTab, setMainTab] = useState('pages');
  const [activeTab, setActiveTab] = useState(PAGE_TABS[0].slug);
  const [savedSlug, setSavedSlug] = useState(null);

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ['admin-content-pages'],
    queryFn: () => api.pages.list(),
  });

  const mutation = useMutation({
    mutationFn: ({ slug, data }) => api.pages.update(slug, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-content-pages'] });
      queryClient.invalidateQueries({ queryKey: ['content-page', variables.slug] });
      setSavedSlug(variables.slug);
      setTimeout(() => setSavedSlug(null), 3000);
    },
  });

  const pageBySlug = Object.fromEntries(pages.map((p) => [p.slug, p]));

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-sm bg-primary/10 flex items-center justify-center">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl tracking-wider text-foreground">Conteúdo</h1>
          <p className="font-body text-sm text-muted-foreground">
            Páginas institucionais e banners da página inicial
          </p>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="mb-8">
          <TabsTrigger value="pages" className="gap-2">
            <FileText className="w-4 h-4" />
            Páginas
          </TabsTrigger>
          <TabsTrigger value="banners" className="gap-2">
            <ImageIcon className="w-4 h-4" />
            Banners da home
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pages">
          {isLoading ? (
            <div className="flex items-center gap-3 text-muted-foreground font-body text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              Carregando páginas...
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-6">
                {PAGE_TABS.map(({ slug, label }) => (
                  <TabsTrigger key={slug} value={slug}>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {PAGE_TABS.map(({ slug }) => (
                <TabsContent key={slug} value={slug}>
                  <PageEditor
                    page={pageBySlug[slug]}
                    saving={mutation.isPending && mutation.variables?.slug === slug}
                    saved={savedSlug === slug}
                    onSave={(data) => mutation.mutate({ slug, data })}
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}

          {mutation.isError && (
            <p className="mt-4 font-body text-sm text-destructive">
              {mutation.error.message || 'Erro ao salvar página'}
            </p>
          )}
        </TabsContent>

        <TabsContent value="banners">
          <HomeBannersEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
