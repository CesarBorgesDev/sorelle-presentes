import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { X, Search } from 'lucide-react';

const inputClass = 'w-full px-3 py-2 bg-background border border-border rounded-sm font-body text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring';
const labelClass = 'block font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5';

export default function KitFormModal({ kit, onClose }) {
  const queryClient = useQueryClient();
  const isEditing = !!kit;

  const [form, setForm] = useState({
    name: kit?.name || '',
    product_id: kit?.product_id || '',
    active: kit?.active ?? true,
  });
  const [selectedIds, setSelectedIds] = useState(() => kit?.product_ids || []);
  const [productSearch, setProductSearch] = useState('');
  const [submitError, setSubmitError] = useState('');

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.entities.Product.list('-created_date'),
  });

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const availableProducts = useMemo(() => {
    const term = productSearch.toLowerCase();
    return products.filter((product) => {
      if (product.id === form.product_id) return false;
      if (!term) return true;
      return (
        product.name?.toLowerCase().includes(term)
        || product.internal_code?.toLowerCase().includes(term)
      );
    });
  }, [products, productSearch, form.product_id]);

  const toggleProduct = (productId) => {
    setSelectedIds((current) => (
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    ));
  };

  const mutation = useMutation({
    mutationFn: (data) => (isEditing
      ? api.entities.ProductKit.update(kit.id, data)
      : api.entities.ProductKit.create(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-kits'] });
      onClose();
    },
    onError: (err) => {
      setSubmitError(err.message || 'Erro ao salvar kit');
    },
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitError('');

    if (!form.name.trim()) {
      setSubmitError('Informe o nome do kit');
      return;
    }
    if (!form.product_id) {
      setSubmitError('Selecione o produto principal');
      return;
    }

    mutation.mutate({
      name: form.name.trim(),
      product_id: form.product_id,
      active: form.active,
      product_ids: selectedIds.filter((id) => id !== form.product_id),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-card border border-border rounded-sm w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <h2 className="font-display text-xl tracking-wider text-foreground">
            {isEditing ? 'Editar Kit' : 'Novo Kit'}
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className={labelClass}>Nome do kit</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className={inputClass}
              placeholder="Ex.: Kit Casal, Kit Banho"
            />
          </div>

          <div>
            <label className={labelClass}>Produto principal</label>
            <select
              value={form.product_id}
              onChange={(e) => {
                const nextId = e.target.value;
                set('product_id', nextId);
                setSelectedIds((current) => current.filter((id) => id !== nextId));
              }}
              className={inputClass}
            >
              <option value="">Selecione um produto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                  {product.internal_code ? ` (${product.internal_code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Produtos relacionados</label>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar produtos..."
                className={`${inputClass} pl-10`}
              />
            </div>

            <div className="max-h-56 overflow-y-auto border border-border rounded-sm divide-y divide-border">
              {availableProducts.length === 0 ? (
                <p className="px-4 py-6 text-center font-body text-sm text-muted-foreground">
                  Nenhum produto disponível.
                </p>
              ) : (
                availableProducts.map((product) => {
                  const checked = selectedIds.includes(product.id);
                  return (
                    <label
                      key={product.id}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/40 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProduct(product.id)}
                        className="rounded border-border"
                      />
                      {product.image_url && (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-10 h-10 object-cover rounded-sm bg-secondary"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="font-body text-sm text-foreground truncate">{product.name}</p>
                        {product.internal_code && (
                          <p className="font-body text-xs text-muted-foreground">{product.internal_code}</p>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <p className="font-body text-xs text-muted-foreground mt-2">
              {selectedIds.length} produto(s) selecionado(s)
            </p>
          </div>

          <label className="flex items-center gap-2 font-body text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
              className="rounded border-border"
            />
            Kit ativo na loja
          </label>

          {submitError && (
            <p className="font-body text-sm text-destructive">{submitError}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-border rounded-sm font-body text-sm hover:bg-secondary transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-sm font-body text-sm tracking-wider hover:opacity-80 transition-opacity disabled:opacity-50"
            >
              {mutation.isPending ? 'Salvando...' : 'Salvar Kit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
