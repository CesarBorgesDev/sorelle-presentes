import React, { useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';
import { Loader2, Plus, Trash2, Upload } from 'lucide-react';

const inputClass = 'w-full px-3 py-2 bg-background border border-border rounded-sm font-body text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring';
const labelClass = 'block font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5';

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getStockValue(stock, colorId, size) {
  const entry = stock.find((item) => item.color_id === colorId && item.size === size);
  return entry?.quantity ?? 0;
}

function upsertStock(stock, colorId, size, quantity) {
  const next = stock.filter((item) => !(item.color_id === colorId && item.size === size));
  next.push({ color_id: colorId, size, quantity: Math.max(0, Number(quantity) || 0) });
  return next;
}

export default function ProductVariantsEditor({ variants, onChange }) {
  const [sizeInput, setSizeInput] = useState('');
  const [uploadingColorId, setUploadingColorId] = useState(null);
  const fileRefs = useRef({});

  const colors = variants?.colors || [];
  const sizes = variants?.sizes || [];
  const stock = variants?.stock || [];
  const sizeSpecifications = variants?.size_specifications || {};

  const uploadMutation = useMutation({
    mutationFn: (payload) => api.images.uploadProduct(payload),
  });

  const updateVariants = (patch) => onChange({ ...variants, ...patch });

  const stockRows = useMemo(() => {
    if (colors.length && sizes.length) {
      return colors.flatMap((color) => sizes.map((size) => ({ color, size })));
    }
    if (colors.length) {
      return colors.map((color) => ({ color, size: null }));
    }
    if (sizes.length) {
      return sizes.map((size) => ({ color: null, size }));
    }
    return [];
  }, [colors, sizes]);

  const addColor = () => {
    const index = colors.length + 1;
    const newColor = {
      id: `cor-${index}`,
      name: `Cor ${index}`,
      hex: '#cccccc',
      image_url: null,
      images: [],
    };

    let nextStock = [...stock];
    if (sizes.length) {
      sizes.forEach((size) => {
        nextStock.push({ color_id: newColor.id, size, quantity: 0 });
      });
    } else {
      nextStock.push({ color_id: newColor.id, size: null, quantity: 0 });
    }

    updateVariants({
      colors: [...colors, newColor],
      stock: nextStock,
    });
  };

  const updateColor = (colorId, patch) => {
    updateVariants({
      colors: colors.map((color) => (color.id === colorId ? { ...color, ...patch } : color)),
    });
  };

  const removeColor = (colorId) => {
    updateVariants({
      colors: colors.filter((color) => color.id !== colorId),
      stock: stock.filter((item) => item.color_id !== colorId),
    });
  };

  const addSize = () => {
    const value = sizeInput.trim().toUpperCase();
    if (!value || sizes.includes(value)) return;

    let nextStock = [...stock];
    if (colors.length) {
      colors.forEach((color) => {
        nextStock.push({ color_id: color.id, size: value, quantity: 0 });
      });
    } else {
      nextStock.push({ color_id: null, size: value, quantity: 0 });
    }

    updateVariants({
      sizes: [...sizes, value],
      stock: nextStock,
      size_specifications: {
        ...sizeSpecifications,
        [value]: sizeSpecifications[value] || '',
      },
    });
    setSizeInput('');
  };

  const removeSize = (size) => {
    const nextSpecs = { ...sizeSpecifications };
    delete nextSpecs[size];

    updateVariants({
      sizes: sizes.filter((item) => item !== size),
      stock: stock.filter((item) => item.size !== size),
      size_specifications: nextSpecs,
    });
  };

  const handleColorImageUpload = async (colorId, file) => {
    if (!file) return;
    setUploadingColorId(colorId);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = await uploadMutation.mutateAsync({
        image: String(dataUrl).split(',')[1],
        mime_type: file.type,
      });
      updateColor(colorId, { image_url: result.url });
    } finally {
      setUploadingColorId(null);
    }
  };

  return (
    <div className="md:col-span-2 space-y-6 border border-border rounded-sm p-4 bg-secondary/20">
      <div>
        <h3 className="font-display text-sm tracking-wider text-foreground mb-1">Cores e tamanhos</h3>
        <p className="font-body text-xs text-muted-foreground">
          Cadastre cores com foto, tamanhos disponíveis e estoque por combinação.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <label className={labelClass}>Cores</label>
          <button
            type="button"
            onClick={addColor}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-sm font-body text-xs hover:bg-secondary transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar cor
          </button>
        </div>

        {colors.length === 0 ? (
          <p className="font-body text-xs text-muted-foreground">Nenhuma cor cadastrada.</p>
        ) : (
          <div className="space-y-3">
            {colors.map((color) => (
              <div key={color.id} className="grid grid-cols-1 sm:grid-cols-[72px_1fr_auto] gap-3 p-3 border border-border rounded-sm bg-background">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-full overflow-hidden border border-border bg-secondary">
                    {color.image_url ? (
                      <img src={resolveMediaUrl(color.image_url)} alt={color.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full" style={{ backgroundColor: color.hex || '#ccc' }} />
                    )}
                  </div>
                  <input
                    type="color"
                    value={color.hex || '#cccccc'}
                    onChange={(e) => updateColor(color.id, { hex: e.target.value })}
                    className="w-10 h-8 cursor-pointer border-0 bg-transparent"
                    title="Cor de referência"
                  />
                </div>

                <div className="space-y-2">
                  <input
                    className={inputClass}
                    value={color.name}
                    onChange={(e) => updateColor(color.id, {
                      name: e.target.value,
                      id: color.id || slugify(e.target.value) || color.id,
                    })}
                    placeholder="Nome da cor"
                  />
                  <input
                    className={inputClass}
                    value={color.image_url || ''}
                    onChange={(e) => updateColor(color.id, { image_url: e.target.value || null })}
                    placeholder="URL da foto desta cor (opcional)"
                  />
                  <div>
                    <input
                      ref={(node) => { fileRefs.current[color.id] = node; }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => handleColorImageUpload(color.id, e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      onClick={() => fileRefs.current[color.id]?.click()}
                      disabled={uploadingColorId === color.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-sm font-body text-xs hover:bg-secondary transition-colors disabled:opacity-50"
                    >
                      {uploadingColorId === color.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      Enviar foto da cor
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeColor(color.id)}
                  className="self-start p-2 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <label className={labelClass}>Tamanhos</label>
        <div className="flex flex-wrap gap-2">
          {sizes.map((size) => (
            <span key={size} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-sm font-body text-xs bg-background">
              {size}
              <button type="button" onClick={() => removeSize(size)} className="text-muted-foreground hover:text-destructive">
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={sizeInput}
            onChange={(e) => setSizeInput(e.target.value)}
            placeholder="Ex: P, M, G, GG"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSize();
              }
            }}
          />
          <button
            type="button"
            onClick={addSize}
            className="shrink-0 px-4 py-2 border border-border rounded-sm font-body text-xs hover:bg-secondary transition-colors"
          >
            Adicionar
          </button>
        </div>
      </div>

      {sizes.length > 0 && (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Especificações por tamanho</label>
            <p className="font-body text-xs text-muted-foreground mt-1">
              Medidas, composição ou detalhes exibidos na loja quando o cliente selecionar o tamanho.
            </p>
          </div>
          <div className="space-y-3">
            {sizes.map((size) => (
              <div key={size} className="p-3 border border-border rounded-sm bg-background space-y-2">
                <label className="font-body text-xs font-medium text-foreground tracking-wider uppercase">
                  Tamanho {size}
                </label>
                <textarea
                  rows={3}
                  className={inputClass}
                  value={sizeSpecifications[size] || ''}
                  onChange={(e) => updateVariants({
                    size_specifications: {
                      ...sizeSpecifications,
                      [size]: e.target.value,
                    },
                  })}
                  placeholder="Ex: Cintura 68–72 cm, quadril 92–96 cm, comprimento 102 cm..."
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {stockRows.length > 0 && (
        <div className="space-y-3">
          <label className={labelClass}>
            {sizes.length > 0 && colors.length === 0 ? 'Estoque por tamanho' : 'Grade de estoque'}
          </label>
          <div className="overflow-x-auto border border-border rounded-sm">
            <table className="w-full min-w-[320px]">
              <thead className="bg-secondary/50">
                <tr>
                  {colors.length > 0 && (
                    <th className="text-left px-3 py-2 font-body text-[10px] uppercase tracking-wider text-muted-foreground">Cor</th>
                  )}
                  {sizes.length > 0 && (
                    <th className="text-left px-3 py-2 font-body text-[10px] uppercase tracking-wider text-muted-foreground">Tamanho</th>
                  )}
                  <th className="text-left px-3 py-2 font-body text-[10px] uppercase tracking-wider text-muted-foreground">Qtd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stockRows.map(({ color, size }) => {
                  const colorId = color?.id || null;
                  const sizeValue = size || null;
                  const key = `${colorId || 'none'}-${sizeValue || 'none'}`;

                  return (
                    <tr key={key}>
                      {colors.length > 0 && (
                        <td className="px-3 py-2 font-body text-xs text-foreground">{color?.name || '—'}</td>
                      )}
                      {sizes.length > 0 && (
                        <td className="px-3 py-2 font-body text-xs text-foreground">{sizeValue || '—'}</td>
                      )}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className={`${inputClass} max-w-[88px]`}
                          value={getStockValue(stock, colorId, sizeValue)}
                          onChange={(e) => updateVariants({
                            stock: upsertStock(stock, colorId, sizeValue, e.target.value),
                          })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
