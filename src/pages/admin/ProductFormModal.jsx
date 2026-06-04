import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { X } from 'lucide-react';

const CATEGORIES = [
  { value: 'casa', label: 'Casa' },
  { value: 'decoracao', label: 'Decoração' },
  { value: 'fragancias', label: 'Fragrâncias' },
  { value: 'cama_mesa_banho', label: 'Cama, Mesa & Banho' },
];

export default function ProductFormModal({ product, onClose }) {
  const queryClient = useQueryClient();
  const isEditing = !!product;

  const [form, setForm] = useState({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price || '',
    original_price: product?.original_price || '',
    category: product?.category || 'casa',
    subcategory: product?.subcategory || '',
    image_url: product?.image_url || '',
    materials: product?.materials || '',
    dimensions: product?.dimensions || '',
    in_stock: product?.in_stock ?? true,
    featured: product?.featured ?? false,
  });

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const mutation = useMutation({
    mutationFn: (data) => isEditing
      ? base44.entities.Product.update(product.id, data)
      : base44.entities.Product.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate({
      ...form,
      price: parseFloat(form.price),
      original_price: form.original_price ? parseFloat(form.original_price) : undefined,
    });
  };

  const inputClass = "w-full px-3 py-2.5 bg-background border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "block font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-sm w-full max-w-2xl max-h-[90vh] overflow-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border sticky top-0 bg-card">
          <h2 className="font-display text-xl tracking-wide text-foreground">
            {isEditing ? 'Editar Produto' : 'Novo Produto'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className={labelClass}>Nome do Produto *</label>
              <input required className={inputClass} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Vaso Orgânico em Cerâmica" />
            </div>

            <div>
              <label className={labelClass}>Categoria *</label>
              <select required className={inputClass} value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Subcategoria</label>
              <input className={inputClass} value={form.subcategory} onChange={e => set('subcategory', e.target.value)} placeholder="Ex: Vasos, Velas..." />
            </div>

            <div>
              <label className={labelClass}>Preço (R$) *</label>
              <input required type="number" step="0.01" min="0" className={inputClass} value={form.price} onChange={e => set('price', e.target.value)} placeholder="199,90" />
            </div>

            <div>
              <label className={labelClass}>Preço Original (R$)</label>
              <input type="number" step="0.01" min="0" className={inputClass} value={form.original_price} onChange={e => set('original_price', e.target.value)} placeholder="Deixe vazio se não houver desconto" />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>URL da Imagem</label>
              <input className={inputClass} value={form.image_url} onChange={e => set('image_url', e.target.value)} placeholder="https://..." />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Descrição</label>
              <textarea rows={3} className={inputClass} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Descrição detalhada do produto..." />
            </div>

            <div>
              <label className={labelClass}>Materiais</label>
              <input className={inputClass} value={form.materials} onChange={e => set('materials', e.target.value)} placeholder="Ex: Cerâmica artesanal" />
            </div>

            <div>
              <label className={labelClass}>Dimensões</label>
              <input className={inputClass} value={form.dimensions} onChange={e => set('dimensions', e.target.value)} placeholder="Ex: 22cm x 15cm" />
            </div>

            <div className="flex items-center gap-3">
              <input type="checkbox" id="in_stock" checked={form.in_stock} onChange={e => set('in_stock', e.target.checked)} className="w-4 h-4 rounded" />
              <label htmlFor="in_stock" className="font-body text-sm text-foreground">Em estoque</label>
            </div>

            <div className="flex items-center gap-3">
              <input type="checkbox" id="featured" checked={form.featured} onChange={e => set('featured', e.target.checked)} className="w-4 h-4 rounded" />
              <label htmlFor="featured" className="font-body text-sm text-foreground">Produto em destaque</label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-5 py-2.5 font-body text-sm text-muted-foreground hover:text-foreground tracking-wider transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-sm font-body text-sm tracking-wider hover:opacity-80 transition-opacity disabled:opacity-50"
            >
              {mutation.isPending ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Criar Produto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}