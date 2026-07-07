import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { buildInitialProductImages, buildProductImagePayload } from '@/lib/productImages';
import ProductImagesEditor from './ProductImagesEditor';
import { X } from 'lucide-react';

const CATEGORIES = [
  { value: 'casa', label: 'Casa' },
  { value: 'decoracao', label: 'Decoração' },
  { value: 'fragancias', label: 'Fragrâncias' },
  { value: 'cama_mesa_banho', label: 'Cama, Mesa & Banho' },
];

function parseOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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
    materials: product?.materials || '',
    dimensions: product?.dimensions || '',
    weight_kg: product?.weight_kg ?? '',
    length_cm: product?.length_cm ?? '',
    width_cm: product?.width_cm ?? '',
    height_cm: product?.height_cm ?? '',
    in_stock: product?.in_stock ?? true,
    featured: product?.featured ?? false,
  });

  const [productImages, setProductImages] = useState(() => buildInitialProductImages(product));

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const mutation = useMutation({
    mutationFn: (data) => isEditing
      ? api.entities.Product.update(product.id, data)
      : api.entities.Product.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      if (isEditing) {
        queryClient.invalidateQueries({ queryKey: ['product', product.id] });
      }
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const imagePayload = buildProductImagePayload(productImages);

    mutation.mutate({
      ...form,
      price: parseFloat(form.price),
      original_price: form.original_price ? parseFloat(form.original_price) : null,
      weight_kg: parseOptionalNumber(form.weight_kg),
      length_cm: parseOptionalNumber(form.length_cm),
      width_cm: parseOptionalNumber(form.width_cm),
      height_cm: parseOptionalNumber(form.height_cm),
      ...imagePayload,
    });
  };

  const inputClass = 'w-full px-3 py-2.5 bg-background border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';
  const labelClass = 'block font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5';
  const selectedCategory = CATEGORIES.find((c) => c.value === form.category);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-sm w-full max-w-2xl max-h-[90vh] overflow-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-display text-xl tracking-wide text-foreground">
            {isEditing ? 'Editar Produto' : 'Novo Produto'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className={labelClass}>Nome do Produto *</label>
              <input required className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex: Vaso Orgânico em Cerâmica" />
            </div>

            <div>
              <label className={labelClass}>Categoria *</label>
              <select required className={inputClass} value={form.category} onChange={(e) => set('category', e.target.value)}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Subcategoria</label>
              <input className={inputClass} value={form.subcategory} onChange={(e) => set('subcategory', e.target.value)} placeholder="Ex: Vasos, Velas..." />
            </div>

            <div>
              <label className={labelClass}>Preço (R$) *</label>
              <input required type="number" step="0.01" min="0" className={inputClass} value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="199,90" />
            </div>

            <div>
              <label className={labelClass}>Preço Original (R$)</label>
              <input type="number" step="0.01" min="0" className={inputClass} value={form.original_price} onChange={(e) => set('original_price', e.target.value)} placeholder="Deixe vazio se não houver desconto" />
            </div>

            <ProductImagesEditor
              images={productImages}
              onChange={setProductImages}
              productName={form.name}
              productCategory={selectedCategory?.label || form.category}
              productMaterials={form.materials}
            />

            <div className="md:col-span-2">
              <label className={labelClass}>Descrição</label>
              <textarea rows={3} className={inputClass} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Descrição detalhada do produto..." />
            </div>

            <div>
              <label className={labelClass}>Materiais</label>
              <input className={inputClass} value={form.materials} onChange={(e) => set('materials', e.target.value)} placeholder="Ex: Cerâmica artesanal" />
            </div>

            <div>
              <label className={labelClass}>Dimensões (texto)</label>
              <input className={inputClass} value={form.dimensions} onChange={(e) => set('dimensions', e.target.value)} placeholder="Ex: 22cm x 15cm" />
            </div>

            <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className={labelClass}>Peso (kg)</label>
                <input type="number" step="0.01" min="0" className={inputClass} value={form.weight_kg} onChange={(e) => set('weight_kg', e.target.value)} placeholder="0.3" />
              </div>
              <div>
                <label className={labelClass}>Comp. (cm)</label>
                <input type="number" step="0.1" min="0" className={inputClass} value={form.length_cm} onChange={(e) => set('length_cm', e.target.value)} placeholder="20" />
              </div>
              <div>
                <label className={labelClass}>Larg. (cm)</label>
                <input type="number" step="0.1" min="0" className={inputClass} value={form.width_cm} onChange={(e) => set('width_cm', e.target.value)} placeholder="15" />
              </div>
              <div>
                <label className={labelClass}>Alt. (cm)</label>
                <input type="number" step="0.1" min="0" className={inputClass} value={form.height_cm} onChange={(e) => set('height_cm', e.target.value)} placeholder="10" />
              </div>
            </div>
            <p className="md:col-span-2 font-body text-xs text-muted-foreground -mt-2">
              Usados no cálculo de frete Correios. Padrão: 0,3 kg e 20×15×10 cm se não informado.
            </p>

            <div className="flex items-center gap-3">
              <input type="checkbox" id="in_stock" checked={form.in_stock} onChange={(e) => set('in_stock', e.target.checked)} className="w-4 h-4 rounded" />
              <label htmlFor="in_stock" className="font-body text-sm text-foreground">Em estoque</label>
            </div>

            <div className="flex items-center gap-3">
              <input type="checkbox" id="featured" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} className="w-4 h-4 rounded" />
              <label htmlFor="featured" className="font-body text-sm text-foreground">Produto em destaque</label>
            </div>
          </div>

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
