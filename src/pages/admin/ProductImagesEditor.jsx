import React, { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';
import { MAX_PRODUCT_IMAGES } from '@/lib/productImages';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Link2,
  Loader2,
  Sparkles,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function validateImageFile(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'Use JPG, PNG ou WebP.';
  }
  if (file.size > 10 * 1024 * 1024) {
    return 'A imagem deve ter no máximo 10 MB.';
  }
  return null;
}

export default function ProductImagesEditor({
  images,
  onChange,
  productName = '',
  productCategory = '',
  productMaterials = '',
}) {
  const uploadFileRef = useRef(null);
  const aiFileRef = useRef(null);
  const [addTab, setAddTab] = useState('url');
  const [urlInput, setUrlInput] = useState('');
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadBase64, setUploadBase64] = useState(null);
  const [uploadMimeType, setUploadMimeType] = useState('image/jpeg');
  const [aiPreview, setAiPreview] = useState(null);
  const [aiBase64, setAiBase64] = useState(null);
  const [aiMimeType, setAiMimeType] = useState('image/jpeg');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canAddMore = images.length < MAX_PRODUCT_IMAGES;

  function addImage(url) {
    const trimmed = url?.trim();
    if (!trimmed) {
      setError('Informe uma URL ou envie uma imagem válida.');
      return;
    }
    if (images.includes(trimmed)) {
      setError('Esta imagem já foi adicionada.');
      return;
    }
    if (images.length >= MAX_PRODUCT_IMAGES) {
      setError(`Máximo de ${MAX_PRODUCT_IMAGES} fotos por produto.`);
      return;
    }

    onChange([...images, trimmed]);
    setUrlInput('');
    setUploadPreview(null);
    setUploadBase64(null);
    setAiPreview(null);
    setAiBase64(null);
    setError('');
    setSuccess('Foto adicionada.');
  }

  function removeImage(index) {
    onChange(images.filter((_, i) => i !== index));
    setSuccess('');
    setError('');
  }

  function moveImage(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  const uploadMutation = useMutation({
    mutationFn: () => api.images.uploadProduct({
      image: uploadBase64,
      mime_type: uploadMimeType,
    }),
    onSuccess: (result) => {
      addImage(result.image_url);
    },
    onError: (err) => {
      setSuccess('');
      setError(err.message || 'Erro ao enviar imagem');
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => api.images.generateScene({
      image: aiBase64,
      mime_type: aiMimeType,
      product_name: productName,
      category: productCategory,
      materials: productMaterials,
    }),
    onSuccess: (result) => {
      addImage(result.image_url);
    },
    onError: (err) => {
      setSuccess('');
      setError(err.message || 'Erro ao gerar imagem');
    },
  });

  async function handleUploadFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSuccess('');
    const dataUrl = await readFileAsDataUrl(file);
    setUploadPreview(dataUrl);
    setUploadBase64(String(dataUrl).split(',')[1]);
    setUploadMimeType(file.type);
  }

  async function handleAiFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSuccess('');
    const dataUrl = await readFileAsDataUrl(file);
    setAiPreview(dataUrl);
    setAiBase64(String(dataUrl).split(',')[1]);
    setAiMimeType(file.type);
  }

  const labelClass = 'block font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5';
  const inputClass = 'w-full px-3 py-2.5 bg-background border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';

  return (
    <div className="space-y-4 p-4 border border-border rounded-sm bg-secondary/30">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <p className="font-body text-sm font-medium text-foreground">Fotos do produto</p>
          <p className="font-body text-xs text-muted-foreground">
            Até {MAX_PRODUCT_IMAGES} imagens. A primeira foto é a capa da vitrine.
          </p>
        </div>
        <span className="font-body text-xs text-muted-foreground">
          {images.length}/{MAX_PRODUCT_IMAGES}
        </span>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((url, index) => (
            <div key={`${url}-${index}`} className="relative group rounded-sm border border-border bg-background overflow-hidden">
              <div className="aspect-[4/5]">
                <img
                  src={resolveMediaUrl(url)}
                  alt={`Foto ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>

              {index === 0 && (
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-sm bg-primary text-primary-foreground text-[10px] font-body uppercase tracking-wider">
                  <Star className="w-3 h-3" />
                  Capa
                </span>
              )}

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 p-2 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveImage(index, -1)}
                    disabled={index === 0}
                    className="p-1.5 rounded-sm bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
                    aria-label="Mover para esquerda"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImage(index, 1)}
                    disabled={index === images.length - 1}
                    className="p-1.5 rounded-sm bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
                    aria-label="Mover para direita"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="p-1.5 rounded-sm bg-destructive/80 text-white hover:bg-destructive"
                  aria-label="Remover foto"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {images.length === 0 && (
        <div className="aspect-[4/5] max-w-xs rounded-sm border border-dashed border-border bg-background flex items-center justify-center">
          <div className="text-center text-muted-foreground p-4">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="font-body text-xs">Nenhuma foto adicionada</p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-sm bg-destructive/10 text-destructive text-sm font-body">{error}</div>
      )}
      {success && (
        <div className="p-3 rounded-sm bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-sm font-body">{success}</div>
      )}

      {canAddMore && (
        <div className="rounded-sm border border-border bg-background p-4 space-y-4">
          <p className="font-body text-sm text-foreground">Adicionar foto</p>

          <Tabs value={addTab} onValueChange={setAddTab}>
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
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    setError('');
                    setSuccess('');
                  }}
                  placeholder="https://images.unsplash.com/..."
                />
              </div>
              <button
                type="button"
                onClick={() => addImage(urlInput)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm font-body text-sm hover:opacity-80"
              >
                <Link2 className="w-4 h-4" />
                Adicionar URL
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
                      Enviar e adicionar
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
                Envie uma foto de referência e gere um cenário com IA para adicionar ao produto.
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
                      Gerar e adicionar
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
      )}
    </div>
  );
}
