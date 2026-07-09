import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { X } from 'lucide-react';

const inputClass = 'w-full px-3 py-2.5 bg-background border border-border rounded-sm font-body text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring';
const labelClass = 'block font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5';

export default function BrandFormModal({ brand, onClose }) {
  const queryClient = useQueryClient();
  const isEditing = !!brand;

  const [form, setForm] = useState({
    name: brand?.name || '',
    logo_url: brand?.logo_url || '',
    website_url: brand?.website_url || '',
    sort_order: brand?.sort_order ?? 0,
    active: brand?.active ?? true,
  });
  const [submitError, setSubmitError] = useState('');

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const mutation = useMutation({
    mutationFn: (data) => (isEditing
      ? api.brands.update(brand.id, data)
      : api.brands.create(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      queryClient.invalidateQueries({ queryKey: ['brands-admin'] });
      onClose();
    },
    onError: (err) => {
      setSubmitError(err.message || 'Erro ao salvar marca');
    },
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitError('');

    if (!form.name.trim()) {
      setSubmitError('Informe o nome da marca');
      return;
    }

    mutation.mutate({
      name: form.name.trim(),
      logo_url: form.logo_url.trim() || null,
      website_url: form.website_url.trim() || null,
      sort_order: Number(form.sort_order) || 0,
      active: Boolean(form.active),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-sm w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="font-display text-xl tracking-wide text-foreground">
            {isEditing ? 'Editar Marca' : 'Nova Marca'}
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
          <div>
            <label className={labelClass}>Nome *</label>
            <input
              required
              className={inputClass}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex: Buddemeyer"
            />
          </div>

          <div>
            <label className={labelClass}>URL do logo (opcional)</label>
            <input
              className={inputClass}
              value={form.logo_url}
              onChange={(e) => set('logo_url', e.target.value)}
              placeholder="https://..."
            />
            <p className="font-body text-xs text-muted-foreground mt-1">
              Se vazio, o carrossel exibe o nome da marca em texto.
            </p>
          </div>

          <div>
            <label className={labelClass}>Site (opcional)</label>
            <input
              type="url"
              className={inputClass}
              value={form.website_url}
              onChange={(e) => set('website_url', e.target.value)}
              placeholder="https://www.marca.com.br"
            />
          </div>

          <div>
            <label className={labelClass}>Ordem no carrossel</label>
            <input
              type="number"
              min="0"
              step="1"
              className={inputClass}
              value={form.sort_order}
              onChange={(e) => set('sort_order', e.target.value)}
            />
            <p className="font-body text-xs text-muted-foreground mt-1">
              Menor número aparece primeiro.
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="font-body text-sm text-foreground">Ativa no carrossel da loja</span>
          </label>

          {submitError && (
            <p className="font-body text-sm text-destructive">{submitError}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-border rounded-sm font-body text-sm hover:bg-secondary transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm font-body text-sm tracking-wider hover:opacity-90 disabled:opacity-50"
            >
              {mutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
