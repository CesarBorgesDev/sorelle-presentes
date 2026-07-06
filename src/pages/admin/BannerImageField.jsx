import React, { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';
import { Link2, Loader2, Upload } from 'lucide-react';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BannerImageField({ label, value, onChange, hint }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [uploadBase64, setUploadBase64] = useState(null);
  const [uploadMimeType, setUploadMimeType] = useState('image/jpeg');
  const [error, setError] = useState('');

  const uploadMutation = useMutation({
    mutationFn: () => api.images.uploadProduct({
      image: uploadBase64,
      mime_type: uploadMimeType,
    }),
    onSuccess: (result) => {
      onChange(result.image_url);
      setPreview(null);
      setUploadBase64(null);
      setError('');
    },
    onError: (err) => {
      setError(err.message || 'Erro ao enviar imagem');
    },
  });

  async function handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Use JPG, PNG ou WebP.');
      return;
    }

    setError('');
    setUploadMimeType(file.type);
    const dataUrl = await readFileAsDataUrl(file);
    setPreview(dataUrl);
    setUploadBase64(dataUrl.split(',')[1]);
  }

  const displaySrc = preview || resolveMediaUrl(value);

  return (
    <div className="space-y-3">
      {label && (
        <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase">
          {label}
        </label>
      )}
      {hint && (
        <p className="font-body text-xs text-muted-foreground">{hint}</p>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="w-full sm:w-40 aspect-[4/3] rounded-sm border border-border overflow-hidden bg-secondary shrink-0">
          {displaySrc ? (
            <img src={displaySrc} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground font-body">
              Sem imagem
            </div>
          )}
        </div>

        <div className="flex-1 space-y-3">
          <div>
            <label className="block font-body text-xs text-muted-foreground mb-1.5">URL da imagem</label>
            <input
              className="w-full h-10 px-3 rounded-sm border border-border bg-background font-body text-sm"
              value={value || ''}
              onChange={(e) => {
                onChange(e.target.value);
                setError('');
              }}
              placeholder="https://... ou /api/uploads/products/..."
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-sm font-body text-sm hover:bg-secondary transition-colors"
            >
              <Upload className="w-4 h-4" />
              Escolher arquivo
            </button>
            <button
              type="button"
              disabled={!uploadBase64 || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate()}
              className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-sm font-body text-sm hover:opacity-90 disabled:opacity-50"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  Enviar e usar
                </>
              )}
            </button>
          </div>

          {error && (
            <p className="font-body text-xs text-destructive">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
