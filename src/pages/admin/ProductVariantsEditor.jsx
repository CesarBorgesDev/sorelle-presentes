import React, { useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';
import { Loader2, Plus, Trash2, Upload, X } from 'lucide-react';

const inputClass = 'w-full px-3 py-2 bg-background border border-border rounded-sm font-body text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring';
const labelClass = 'block font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5';
const MAX_VARIANT_IMAGES = 6;

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

function getStockEntry(stock, colorId, size) {
  return stock.find((item) => item.color_id === colorId && item.size === size) || null;
}

function getStockValue(stock, colorId, size) {
  return getStockEntry(stock, colorId, size)?.quantity ?? 0;
}

function getStockPrice(stock, colorId, size, field) {
  const entry = getStockEntry(stock, colorId, size);
  const value = entry?.[field];
  return value == null || value === '' ? '' : String(value);
}

function upsertStock(stock, colorId, size, patch) {
  const existing = getStockEntry(stock, colorId, size) || {
    color_id: colorId,
    size,
    quantity: 0,
    price: null,
    original_price: null,
  };
  const next = stock.filter((item) => !(item.color_id === colorId && item.size === size));
  const merged = { ...existing, ...patch };

  if (patch.quantity !== undefined) {
    merged.quantity = Math.max(0, Number(patch.quantity) || 0);
  }
  if (patch.price !== undefined) {
    const raw = String(patch.price).trim().replace(',', '.');
    merged.price = raw === '' ? null : Math.max(0, Number(raw) || 0);
  }
  if (patch.original_price !== undefined) {
    const raw = String(patch.original_price).trim().replace(',', '.');
    merged.original_price = raw === '' ? null : Math.max(0, Number(raw) || 0);
  }

  next.push(merged);
  return next;
}

function getColorGallery(color) {
  return [
    color?.image_url,
    ...(Array.isArray(color?.images) ? color.images : []),
  ].filter(Boolean);
}

function setColorGallery(urls) {
  const cleaned = (urls || []).filter(Boolean).slice(0, MAX_VARIANT_IMAGES);
  return {
    image_url: cleaned[0] || null,
    images: cleaned.slice(1),
  };
}

function getSizeGallery(sizeImages, size) {
  const entry = sizeImages?.[size] || {};
  return [
    entry.image_url,
    ...(Array.isArray(entry.images) ? entry.images : []),
  ].filter(Boolean);
}

function setSizeGallery(urls) {
  const cleaned = (urls || []).filter(Boolean).slice(0, MAX_VARIANT_IMAGES);
  return {
    image_url: cleaned[0] || null,
    images: cleaned.slice(1),
  };
}

export default function ProductVariantsEditor({ variants, onChange }) {
  const [sizeInput, setSizeInput] = useState('');
  const [uploadingKey, setUploadingKey] = useState(null);
  const fileRefs = useRef({});

  const colors = variants?.colors || [];
  const sizes = variants?.sizes || [];
  const stock = variants?.stock || [];
  const sizeSpecifications = variants?.size_specifications || {};
  const sizeImages = variants?.size_images || {};

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
        nextStock.push({
          color_id: newColor.id,
          size,
          quantity: 0,
          price: null,
          original_price: null,
        });
      });
    } else {
      nextStock.push({
        color_id: newColor.id,
        size: null,
        quantity: 0,
        price: null,
        original_price: null,
      });
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
        nextStock.push({
          color_id: color.id,
          size: value,
          quantity: 0,
          price: null,
          original_price: null,
        });
      });
    } else {
      nextStock.push({
        color_id: null,
        size: value,
        quantity: 0,
        price: null,
        original_price: null,
      });
    }

    updateVariants({
      sizes: [...sizes, value],
      stock: nextStock,
      size_specifications: {
        ...sizeSpecifications,
        [value]: sizeSpecifications[value] || '',
      },
      size_images: {
        ...sizeImages,
        [value]: sizeImages[value] || { image_url: null, images: [] },
      },
    });
    setSizeInput('');
  };

  const removeSize = (size) => {
    const nextSpecs = { ...sizeSpecifications };
    delete nextSpecs[size];
    const nextSizeImages = { ...sizeImages };
    delete nextSizeImages[size];

    updateVariants({
      sizes: sizes.filter((item) => item !== size),
      stock: stock.filter((item) => item.size !== size),
      size_specifications: nextSpecs,
      size_images: nextSizeImages,
    });
  };

  const uploadImage = async (key, file) => {
    if (!file) return null;
    setUploadingKey(key);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = await uploadMutation.mutateAsync({
        image: String(dataUrl).split(',')[1],
        mime_type: file.type,
      });
      return result.url;
    } finally {
      setUploadingKey(null);
    }
  };

  const handleColorImageUpload = async (colorId, file) => {
    const url = await uploadImage(`color-${colorId}`, file);
    if (!url) return;
    const color = colors.find((item) => item.id === colorId);
    const gallery = getColorGallery(color);
    if (gallery.length >= MAX_VARIANT_IMAGES) return;
    updateColor(colorId, setColorGallery([...gallery, url]));
  };

  const removeColorImage = (colorId, index) => {
    const color = colors.find((item) => item.id === colorId);
    const gallery = getColorGallery(color).filter((_, i) => i !== index);
    updateColor(colorId, setColorGallery(gallery));
  };

  const handleSizeImageUpload = async (size, file) => {
    const url = await uploadImage(`size-${size}`, file);
    if (!url) return;
    const gallery = getSizeGallery(sizeImages, size);
    if (gallery.length >= MAX_VARIANT_IMAGES) return;
    updateVariants({
      size_images: {
        ...sizeImages,
        [size]: setSizeGallery([...gallery, url]),
      },
    });
  };

  const removeSizeImage = (size, index) => {
    const gallery = getSizeGallery(sizeImages, size).filter((_, i) => i !== index);
    updateVariants({
      size_images: {
        ...sizeImages,
        [size]: setSizeGallery(gallery),
      },
    });
  };

  return (
    <div className="md:col-span-2 space-y-6 border border-border rounded-sm p-4 bg-secondary/20">
      <div>
        <h3 className="font-display text-sm tracking-wider text-foreground mb-1">Cores, tamanhos e grade</h3>
        <p className="font-body text-xs text-muted-foreground">
          Cadastre cores/modelos com fotos, fotos por tamanho e preços diferentes na grade de estoque.
          Preço vazio usa o preço base do produto.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <label className={labelClass}>Cores / modelos</label>
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
            {colors.map((color) => {
              const gallery = getColorGallery(color);
              return (
                <div key={color.id} className="grid grid-cols-1 sm:grid-cols-[72px_1fr_auto] gap-3 p-3 border border-border rounded-sm bg-background">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-14 h-14 rounded-full overflow-hidden border border-border bg-secondary">
                      {gallery[0] ? (
                        <img src={resolveMediaUrl(gallery[0])} alt={color.name} className="w-full h-full object-cover" />
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
                      placeholder="Nome da cor / modelo"
                    />

                    {gallery.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {gallery.map((url, index) => (
                          <div key={`${url}-${index}`} className="relative w-14 h-14 rounded-sm overflow-hidden border border-border">
                            <img src={resolveMediaUrl(url)} alt="" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removeColorImage(color.id, index)}
                              className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-background/90 text-muted-foreground hover:text-destructive"
                              title="Remover foto"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div>
                      <input
                        ref={(node) => { fileRefs.current[`color-${color.id}`] = node; }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          handleColorImageUpload(color.id, e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fileRefs.current[`color-${color.id}`]?.click()}
                        disabled={uploadingKey === `color-${color.id}` || gallery.length >= MAX_VARIANT_IMAGES}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-sm font-body text-xs hover:bg-secondary transition-colors disabled:opacity-50"
                      >
                        {uploadingKey === `color-${color.id}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        Adicionar foto da cor
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
              );
            })}
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
            <label className={labelClass}>Fotos e especificações por tamanho</label>
            <p className="font-body text-xs text-muted-foreground mt-1">
              Foto específica do tamanho (usada se a cor não tiver foto). Medidas opcionais para a loja.
            </p>
          </div>
          <div className="space-y-3">
            {sizes.map((size) => {
              const gallery = getSizeGallery(sizeImages, size);
              return (
                <div key={size} className="p-3 border border-border rounded-sm bg-background space-y-3">
                  <label className="font-body text-xs font-medium text-foreground tracking-wider uppercase">
                    Tamanho {size}
                  </label>

                  {gallery.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {gallery.map((url, index) => (
                        <div key={`${url}-${index}`} className="relative w-14 h-14 rounded-sm overflow-hidden border border-border">
                          <img src={resolveMediaUrl(url)} alt="" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeSizeImage(size, index)}
                            className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-background/90 text-muted-foreground hover:text-destructive"
                            title="Remover foto"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <input
                      ref={(node) => { fileRefs.current[`size-${size}`] = node; }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        handleSizeImageUpload(size, e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileRefs.current[`size-${size}`]?.click()}
                      disabled={uploadingKey === `size-${size}` || gallery.length >= MAX_VARIANT_IMAGES}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-sm font-body text-xs hover:bg-secondary transition-colors disabled:opacity-50"
                    >
                      {uploadingKey === `size-${size}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      Adicionar foto do tamanho
                    </button>
                  </div>

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
              );
            })}
          </div>
        </div>
      )}

      {stockRows.length > 0 && (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>
              {sizes.length > 0 && colors.length === 0 ? 'Estoque e preços por tamanho' : 'Grade de estoque e preços'}
            </label>
            <p className="font-body text-xs text-muted-foreground mt-1">
              Deixe preço em branco para usar o preço base do produto.
            </p>
          </div>
          <div className="overflow-x-auto border border-border rounded-sm">
            <table className="w-full min-w-[480px]">
              <thead className="bg-secondary/50">
                <tr>
                  {colors.length > 0 && (
                    <th className="text-left px-3 py-2 font-body text-[10px] uppercase tracking-wider text-muted-foreground">Cor</th>
                  )}
                  {sizes.length > 0 && (
                    <th className="text-left px-3 py-2 font-body text-[10px] uppercase tracking-wider text-muted-foreground">Tamanho</th>
                  )}
                  <th className="text-left px-3 py-2 font-body text-[10px] uppercase tracking-wider text-muted-foreground">Qtd</th>
                  <th className="text-left px-3 py-2 font-body text-[10px] uppercase tracking-wider text-muted-foreground">Preço</th>
                  <th className="text-left px-3 py-2 font-body text-[10px] uppercase tracking-wider text-muted-foreground">De</th>
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
                          className={`${inputClass} max-w-[72px]`}
                          value={getStockValue(stock, colorId, sizeValue)}
                          onChange={(e) => updateVariants({
                            stock: upsertStock(stock, colorId, sizeValue, { quantity: e.target.value }),
                          })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={`${inputClass} max-w-[100px]`}
                          value={getStockPrice(stock, colorId, sizeValue, 'price')}
                          onChange={(e) => updateVariants({
                            stock: upsertStock(stock, colorId, sizeValue, { price: e.target.value }),
                          })}
                          placeholder="Base"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={`${inputClass} max-w-[100px]`}
                          value={getStockPrice(stock, colorId, sizeValue, 'original_price')}
                          onChange={(e) => updateVariants({
                            stock: upsertStock(stock, colorId, sizeValue, { original_price: e.target.value }),
                          })}
                          placeholder="—"
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
