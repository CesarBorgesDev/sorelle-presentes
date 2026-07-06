import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { api } from '@/api/apiClient';
import { DEFAULT_HOME_BANNERS } from '@/lib/homeBannersDefaults';
import BannerImageField from './BannerImageField';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ImageIcon,
  Loader2,
} from 'lucide-react';

function cloneBanners(data) {
  return JSON.parse(JSON.stringify(data || DEFAULT_HOME_BANNERS));
}

function moveItem(list, fromIndex, toIndex) {
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function SectionBannerCard({ section, index, total, onChange, onMoveUp, onMoveDown }) {
  return (
    <div className="rounded-sm border border-border bg-background p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-1 text-muted-foreground">
          <GripVertical className="w-5 h-5" />
        </div>
        <div className="flex-1 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="font-body text-xs text-muted-foreground uppercase tracking-wider">
                Seção {index + 1} de {total}
              </p>
              <h3 className="font-display text-lg tracking-wide text-foreground">
                {section.banner.title || section.categoryKey}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={index === 0}
                onClick={onMoveUp}
                className="p-2 rounded-sm border border-border hover:bg-secondary disabled:opacity-40"
                aria-label="Mover para cima"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={index === total - 1}
                onClick={onMoveDown}
                className="p-2 rounded-sm border border-border hover:bg-secondary disabled:opacity-40"
                aria-label="Mover para baixo"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">
                Título do banner
              </label>
              <input
                className="w-full h-10 px-3 rounded-sm border border-border bg-background font-body text-sm"
                value={section.banner.title}
                onChange={(e) => onChange({
                  ...section,
                  banner: { ...section.banner, title: e.target.value },
                })}
              />
            </div>
            <div>
              <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">
                Categoria
              </label>
              <input
                className="w-full h-10 px-3 rounded-sm border border-border bg-secondary font-body text-sm"
                value={section.categoryKey}
                readOnly
              />
            </div>
          </div>

          <div>
            <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">
              Descrição
            </label>
            <textarea
              className="w-full min-h-[88px] px-3 py-2 rounded-sm border border-border bg-background font-body text-sm resize-y"
              value={section.banner.description}
              onChange={(e) => onChange({
                ...section,
                banner: { ...section.banner, description: e.target.value },
              })}
            />
          </div>

          <BannerImageField
            label="Imagem do banner"
            value={section.banner.image}
            onChange={(image) => onChange({
              ...section,
              banner: { ...section.banner, image },
            })}
          />

          <label className="inline-flex items-center gap-2 font-body text-sm text-foreground">
            <input
              type="checkbox"
              checked={section.banner.reverse}
              onChange={(e) => onChange({
                ...section,
                banner: { ...section.banner, reverse: e.target.checked },
              })}
            />
            Imagem à direita (layout invertido)
          </label>
        </div>
      </div>
    </div>
  );
}

export default function HomeBannersEditor() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => cloneBanners(DEFAULT_HOME_BANNERS));
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['home-banners'],
    queryFn: () => api.homeBanners.get(),
  });

  useEffect(() => {
    if (data) {
      setForm(cloneBanners(data));
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (payload) => api.homeBanners.update(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-banners'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  function updateSlide(index, patch) {
    setForm((current) => {
      const slides = [...current.hero.slides];
      slides[index] = { ...slides[index], ...patch };
      return { ...current, hero: { ...current.hero, slides } };
    });
  }

  function updateSection(index, section) {
    setForm((current) => {
      const sections = [...current.sections];
      sections[index] = section;
      return { ...current, sections };
    });
  }

  function handleDragEnd(result) {
    if (!result.destination) return;
    setForm((current) => ({
      ...current,
      sections: moveItem(current.sections, result.source.index, result.destination.index),
    }));
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground font-body text-sm">
        <Loader2 className="w-5 h-5 animate-spin" />
        Carregando banners...
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section className="space-y-6">
        <div>
          <h2 className="font-display text-xl tracking-wide text-foreground mb-1">Banner inicial</h2>
          <p className="font-body text-sm text-muted-foreground">
            As imagens do topo da página inicial alternam ao passar o mouse nas categorias.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">
              Título da marca
            </label>
            <input
              className="w-full h-10 px-3 rounded-sm border border-border bg-background font-body text-sm"
              value={form.hero.brandTitle}
              onChange={(e) => setForm((current) => ({
                ...current,
                hero: { ...current.hero, brandTitle: e.target.value },
              }))}
            />
          </div>
          <div>
            <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">
              Subtítulo
            </label>
            <input
              className="w-full h-10 px-3 rounded-sm border border-border bg-background font-body text-sm"
              value={form.hero.brandSubtitle}
              onChange={(e) => setForm((current) => ({
                ...current,
                hero: { ...current.hero, brandSubtitle: e.target.value },
              }))}
            />
          </div>
        </div>

        <div className="space-y-6">
          {form.hero.slides.map((slide, index) => (
            <div key={slide.key} className="rounded-sm border border-border p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-primary" />
                <h3 className="font-display text-lg tracking-wide">{slide.label}</h3>
              </div>
              <BannerImageField
                label={`Imagem — ${slide.label}`}
                value={slide.image}
                onChange={(image) => updateSlide(index, { image })}
                hint="Esta imagem aparece quando o visitante passa o mouse sobre a categoria correspondente."
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="font-display text-xl tracking-wide text-foreground mb-1">Banners das seções</h2>
          <p className="font-body text-sm text-muted-foreground">
            Arraste para reordenar ou use as setas. A ordem aqui define a sequência na página inicial.
          </p>
        </div>

        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="section-banners">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-4">
                {form.sections.map((section, index) => (
                  <Draggable key={section.id} draggableId={section.id} index={index}>
                    {(dragProvided, snapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        {...dragProvided.dragHandleProps}
                        className={snapshot.isDragging ? 'opacity-90' : undefined}
                      >
                        <SectionBannerCard
                          section={section}
                          index={index}
                          total={form.sections.length}
                          onChange={(updated) => updateSection(index, updated)}
                          onMoveUp={() => setForm((current) => ({
                            ...current,
                            sections: moveItem(current.sections, index, index - 1),
                          }))}
                          onMoveDown={() => setForm((current) => ({
                            ...current,
                            sections: moveItem(current.sections, index, index + 1),
                          }))}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </section>

      <div className="flex items-center gap-4 pt-2">
        <button
          type="button"
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-sm font-body text-sm tracking-wide hover:opacity-90 disabled:opacity-50"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Salvar banners
        </button>
        {saved && (
          <span className="inline-flex items-center gap-2 font-body text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="w-4 h-4" />
            Salvo com sucesso
          </span>
        )}
      </div>

      {mutation.isError && (
        <p className="font-body text-sm text-destructive">
          {mutation.error.message || 'Erro ao salvar banners'}
        </p>
      )}
    </div>
  );
}
