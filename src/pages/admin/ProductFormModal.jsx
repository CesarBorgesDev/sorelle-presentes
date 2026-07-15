import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { buildInitialProductImages, buildProductImagePayload } from '@/lib/productImages';
import ProductImagesEditor from './ProductImagesEditor';
import ProductVariantsEditor from './ProductVariantsEditor';
import { ensureVariantStockMatrix, getTotalSizeStock, usesSizeStock } from '@/lib/productVariants';
import { X } from 'lucide-react';

function parseOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function ProductFormModal({ product, onClose }) {
  const queryClient = useQueryClient();
  const isEditing = !!product;

  const { data: categoriesData = [] } = useQuery({
    queryKey: ['categories-admin-flat'],
    queryFn: () => api.categories.listFlat(true),
  });
  const categoryOptions = categoriesData.map((category) => {
    const parent = category.parent_id ? categoriesData.find((c) => c.id === category.parent_id) : null;
    const prefix = parent ? `${parent.name} > ` : '';
    const suffix = category.active ? '' : ' (inativa)';
    return { value: category.slug, label: `${prefix}${category.name}${suffix}` };
  });
  if (product?.category && !categoryOptions.some((option) => option.value === product.category)) {
    categoryOptions.push({ value: product.category, label: product.category.replace(/_/g, ' ') });
  }

  const [form, setForm] = useState({
    name: product?.name || '',
    description: product?.description || '',
    product_specifications: product?.product_specifications || '',
    technology: product?.technology || '',
    care_instructions: product?.care_instructions || '',
    price: product?.price || '',
    original_price: product?.original_price || '',
    category: product?.category || '',
    subcategory: product?.subcategory || '',
    materials: product?.materials || '',
    dimensions: product?.dimensions || '',
    weight_kg: product?.weight_kg ?? '',
    length_cm: product?.length_cm ?? '',
    width_cm: product?.width_cm ?? '',
    height_cm: product?.height_cm ?? '',
    quantity: product?.quantity ?? 0,
    internal_code: product?.internal_code || '',
    featured: product?.featured ?? false,
  });

  const [productImages, setProductImages] = useState(() => buildInitialProductImages(product));
  const [variants, setVariants] = useState(() => ({
    colors: [],
    sizes: [],
    stock: [],
    size_specifications: {},
    ...(product?.variants || {}),
  }));
  const [internalCodeError, setInternalCodeError] = useState('');
  const [checkingInternalCode, setCheckingInternalCode] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (field === 'internal_code') {
      setInternalCodeError('');
      setSubmitError('');
    }
  };

  useEffect(() => {
    const code = form.internal_code.trim();
    if (!code) {
      setInternalCodeError('');
      setCheckingInternalCode(false);
      return undefined;
    }

    setCheckingInternalCode(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api.products.checkInternalCode(code, isEditing ? product.id : null);
        if (!result.available && result.conflict) {
          setInternalCodeError(
            `Código já usado por "${result.conflict.name}" (${result.conflict.internal_code}).`
          );
        } else {
          setInternalCodeError('');
        }
      } catch {
        setInternalCodeError('');
      } finally {
        setCheckingInternalCode(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [form.internal_code, isEditing, product?.id]);

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
    onError: (err) => {
      setSubmitError(err.message || 'Erro ao salvar produto');
      if (err.status === 409) {
        setInternalCodeError(err.message || 'Este código interno já existe.');
      }
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');

    const trimmedCode = form.internal_code.trim();
    if (trimmedCode) {
      try {
        const result = await api.products.checkInternalCode(trimmedCode, isEditing ? product.id : null);
        if (!result.available) {
          setInternalCodeError(
            result.conflict
              ? `Código já usado por "${result.conflict.name}" (${result.conflict.internal_code}).`
              : 'Este código interno já existe.'
          );
          return;
        }
      } catch (err) {
        setSubmitError(err.message || 'Erro ao validar código interno');
        return;
      }
    }

    const imagePayload = buildProductImagePayload(productImages);

    mutation.mutate({
      ...form,
      price: parseFloat(form.price),
      original_price: form.original_price ? parseFloat(form.original_price) : null,
      weight_kg: parseOptionalNumber(form.weight_kg),
      length_cm: parseOptionalNumber(form.length_cm),
      width_cm: parseOptionalNumber(form.width_cm),
      height_cm: parseOptionalNumber(form.height_cm),
      quantity: Math.max(0, parseInt(form.quantity, 10) || 0),
      internal_code: trimmedCode || null,
      variants,
      ...imagePayload,
    });
  };

  const inputClass = 'w-full px-3 py-2.5 bg-background border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';
  const labelClass = 'block font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5';
  const selectedCategory = categoryOptions.find((c) => c.value === form.category);
  const hasSizeGrid = usesSizeStock(variants);
  const computedStockTotal = getTotalSizeStock(ensureVariantStockMatrix(variants));

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
                <option value="" disabled>Selecione...</option>
                {categoryOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
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

            <div>
              <label className={labelClass}>Código interno</label>
              <input
                className={`${inputClass} ${internalCodeError ? 'border-destructive focus:ring-destructive' : ''}`}
                value={form.internal_code}
                onChange={(e) => set('internal_code', e.target.value)}
                placeholder="Ex: SOR-001"
                autoComplete="off"
              />
              {checkingInternalCode && (
                <p className="font-body text-xs text-muted-foreground mt-1">Verificando código...</p>
              )}
              {internalCodeError && (
                <p className="font-body text-xs text-destructive mt-1">{internalCodeError}</p>
              )}
              {!internalCodeError && !checkingInternalCode && form.internal_code.trim() && (
                <p className="font-body text-xs text-emerald-700 mt-1">Código disponível</p>
              )}
            </div>

            <div>
              <label className={labelClass}>Quantidade em estoque{hasSizeGrid ? ' (total)' : ' *'}</label>
              <input
                required={!hasSizeGrid}
                readOnly={hasSizeGrid}
                type="number"
                min="0"
                step="1"
                className={`${inputClass} ${hasSizeGrid ? 'bg-secondary/50 cursor-not-allowed' : ''}`}
                value={hasSizeGrid ? (computedStockTotal ?? 0) : form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
                placeholder="0"
              />
              <p className="font-body text-xs text-muted-foreground mt-1">
                {hasSizeGrid
                  ? 'Com grade de tamanhos, o estoque é controlado por tamanho na seção abaixo.'
                  : 'Com quantidade zero, o produto fica indisponível para venda.'}
              </p>
            </div>

            <ProductImagesEditor
              images={productImages}
              onChange={setProductImages}
              productName={form.name}
              productCategory={selectedCategory?.label || form.category}
              productMaterials={form.materials}
            />

            <ProductVariantsEditor variants={variants} onChange={setVariants} />

            <div className="md:col-span-2">
              <label className={labelClass}>Descrição</label>
              <textarea rows={3} className={inputClass} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Descrição detalhada do produto..." />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Especificações do produto</label>
              <textarea rows={3} className={inputClass} value={form.product_specifications} onChange={(e) => set('product_specifications', e.target.value)} placeholder="Detalhes, composição, acabamento..." />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Tecnologia</label>
              <textarea rows={3} className={inputClass} value={form.technology} onChange={(e) => set('technology', e.target.value)} placeholder="Tecnologias, diferenciais e inovações do produto..." />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Cuidados</label>
              <textarea rows={3} className={inputClass} value={form.care_instructions} onChange={(e) => set('care_instructions', e.target.value)} placeholder="Instruções de lavagem, conservação e uso..." />
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
              <input type="checkbox" id="featured" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} className="w-4 h-4 rounded" />
              <label htmlFor="featured" className="font-body text-sm text-foreground">Produto em destaque</label>
            </div>
          </div>

          {submitError && !internalCodeError && (
            <p className="font-body text-sm text-destructive">{submitError}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-5 py-2.5 font-body text-sm text-muted-foreground hover:text-foreground tracking-wider transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || checkingInternalCode || Boolean(internalCodeError)}
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
