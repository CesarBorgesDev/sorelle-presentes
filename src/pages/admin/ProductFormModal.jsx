import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, Upload, Sparkles, Loader2, ImageIcon, Link2 } from 'lucide-react';

const CATEGORIES = [
  { value: 'casa', label: 'Casa' },
  { value: 'decoracao', label: 'Decoração' },
  { value: 'fragancias', label: 'Fragrâncias' },
  { value: 'cama_mesa_banho', label: 'Cama, Mesa & Banho' },
];

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveImageSrc(url) {
  if (!url) return '';
  return url;
}

export default function ProductFormModal({ product, onClose }) {
  const queryClient = useQueryClient();
  const uploadFileRef = useRef(null);
  const aiFileRef = useRef(null);
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
    weight_kg: product?.weight_kg ?? '',
    length_cm: product?.length_cm ?? '',
    width_cm: product?.width_cm ?? '',
    height_cm: product?.height_cm ?? '',
    in_stock: product?.in_stock ?? true,
    featured: product?.featured ?? false,
  });

  const [imageTab, setImageTab] = useState('url');
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadBase64, setUploadBase64] = useState(null);
  const [uploadMimeType, setUploadMimeType] = useState('image/jpeg');
  const [aiPreview, setAiPreview] = useState(null);
  const [aiBase64, setAiBase64] = useState(null);
  const [aiMimeType, setAiMimeType] = useState('image/jpeg');
  const [imageError, setImageError] = useState('');
  const [imageSuccess, setImageSuccess] = useState('');

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const mutation = useMutation({
    mutationFn: (data) => isEditing
      ? api.entities.Product.update(product.id, data)
      : api.entities.Product.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: () => api.images.uploadProduct({
      image: uploadBase64,
      mime_type: uploadMimeType,
    }),
    onSuccess: (result) => {
      set('image_url', result.image_url);
      setImageError('');
      setImageSuccess(result.message || 'Imagem enviada e aplicada ao produto');
    },
    onError: (err) => {
      setImageSuccess('');
      setImageError(err.message || 'Erro ao enviar imagem');
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => api.images.generateScene({
      image: aiBase64,
      mime_type: aiMimeType,
      product_name: form.name,
      category: CATEGORIES.find((c) => c.value === form.category)?.label || form.category,
      materials: form.materials,
    }),
    onSuccess: (result) => {
      set('image_url', result.image_url);
      setImageError('');
      setImageSuccess(result.message || 'Imagem gerada com sucesso');
    },
    onError: (err) => {
      setImageSuccess('');
      setImageError(err.message || 'Erro ao gerar imagem');
    },
  });

  const validateImageFile = (file) => {
    if (!file.type.startsWith('image/')) {
      return 'Selecione um arquivo de imagem (JPG, PNG ou WebP)';
    }
    if (file.size > 10 * 1024 * 1024) {
      return 'A imagem deve ter no máximo 10 MB';
    }
    return null;
  };

  const handleUploadFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setImageError(validationError);
      return;
    }

    setImageError('');
    setImageSuccess('');
    const dataUrl = await readFileAsDataUrl(file);
    setUploadPreview(dataUrl);
    setUploadBase64(dataUrl);
    setUploadMimeType(file.type);
  };

  const handleAiFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setImageError(validationError);
      return;
    }

    setImageError('');
    setImageSuccess('');
    const dataUrl = await readFileAsDataUrl(file);
    setAiPreview(dataUrl);
    setAiBase64(dataUrl);
    setAiMimeType(file.type);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate({
      ...form,
      price: parseFloat(form.price),
      original_price: form.original_price ? parseFloat(form.original_price) : null,
      weight_kg: parseOptionalNumber(form.weight_kg),
      length_cm: parseOptionalNumber(form.length_cm),
      width_cm: parseOptionalNumber(form.width_cm),
      height_cm: parseOptionalNumber(form.height_cm),
      image_url: form.image_url?.trim() || null,
    });
  };

  const inputClass = 'w-full px-3 py-2.5 bg-background border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';
  const labelClass = 'block font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5';

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

            <div className="md:col-span-2 space-y-4 p-4 border border-border rounded-sm bg-secondary/30">
              <p className="font-body text-sm font-medium text-foreground">Imagem do produto</p>

              <div className="aspect-[4/5] max-w-xs rounded-sm border border-border bg-background overflow-hidden flex items-center justify-center">
                {form.image_url ? (
                  <img
                    src={resolveImageSrc(form.image_url)}
                    alt="Preview do produto"
                    className="w-full h-full object-cover"
                    onError={() => setImageError('Não foi possível carregar a imagem. Verifique a URL ou envie novamente.')}
                  />
                ) : (
                  <div className="text-center text-muted-foreground p-4">
                    <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="font-body text-xs">Nenhuma imagem selecionada</p>
                  </div>
                )}
              </div>

              {imageError && (
                <div className="p-3 rounded-sm bg-destructive/10 text-destructive text-sm font-body">{imageError}</div>
              )}
              {imageSuccess && (
                <div className="p-3 rounded-sm bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-sm font-body">{imageSuccess}</div>
              )}

              <Tabs value={imageTab} onValueChange={setImageTab}>
                <TabsList className="w-full grid grid-cols-3 h-auto">
                  <TabsTrigger value="url" className="gap-1.5 text-xs sm:text-sm">
                    <Link2 className="w-3.5 h-3.5" />
                    URL
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="gap-1.5 text-xs sm:text-sm">
                    <Upload className="w-3.5 h-3.5" />
                    Upload
                  </TabsTrigger>
                  <TabsTrigger value="ai" className="gap-1.5 text-xs sm:text-sm">
                    <Sparkles className="w-3.5 h-3.5" />
                    Gerar IA
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="url" className="mt-4 space-y-3">
                  <p className="font-body text-xs text-muted-foreground">
                    Cole o link direto de uma imagem (Unsplash, CDN ou `/api/uploads/...`).
                  </p>
                  <div>
                    <label className={labelClass}>URL da imagem</label>
                    <input
                      className={inputClass}
                      value={form.image_url}
                      onChange={(e) => {
                        set('image_url', e.target.value);
                        setImageError('');
                        setImageSuccess('');
                      }}
                      placeholder="https://images.unsplash.com/..."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!form.image_url?.trim()) {
                        setImageError('Informe uma URL de imagem');
                        return;
                      }
                      setImageError('');
                      setImageSuccess('URL aplicada. Salve o produto para confirmar.');
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm font-body text-sm hover:opacity-80"
                  >
                    <Link2 className="w-4 h-4" />
                    Usar esta URL
                  </button>
                </TabsContent>

                <TabsContent value="upload" className="mt-4 space-y-3">
                  <p className="font-body text-xs text-muted-foreground">
                    Envie JPG, PNG ou WebP (até 10 MB). A imagem fica salva no servidor.
                  </p>
                  <input
                    ref={uploadFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleUploadFileSelect}
                  />
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => uploadFileRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-sm font-body text-sm hover:bg-secondary transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      Escolher arquivo
                    </button>
                    <button
                      type="button"
                      disabled={!uploadBase64 || uploadMutation.isPending}
                      onClick={() => uploadMutation.mutate()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm font-body text-sm hover:opacity-80 disabled:opacity-50"
                    >
                      {uploadMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Enviar e usar imagem
                        </>
                      )}
                    </button>
                  </div>
                  {uploadPreview && (
                    <div className="max-w-[140px] aspect-[4/5] rounded-sm border border-border overflow-hidden">
                      <img src={uploadPreview} alt="Arquivo selecionado" className="w-full h-full object-cover" />
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="ai" className="mt-4 space-y-3">
                  <p className="font-body text-xs text-muted-foreground">
                    Envie uma foto do produto e gere um cenário sofisticado com IA (Stable Horde / Pollinations).
                  </p>
                  <input
                    ref={aiFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleAiFileSelect}
                  />
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => aiFileRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-sm font-body text-sm hover:bg-secondary transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      Foto de referência
                    </button>
                    <button
                      type="button"
                      disabled={!aiBase64 || generateMutation.isPending}
                      onClick={() => generateMutation.mutate()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm font-body text-sm hover:opacity-80 disabled:opacity-50"
                    >
                      {generateMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Gerando...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Gerar cenário
                        </>
                      )}
                    </button>
                  </div>
                  {aiPreview && (
                    <div className="max-w-[140px] aspect-[4/5] rounded-sm border border-border overflow-hidden">
                      <img src={aiPreview} alt="Referência IA" className="w-full h-full object-cover" />
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>

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
