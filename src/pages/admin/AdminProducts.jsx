import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import ProductViewToggle, { useProductViewMode } from '@/components/ProductViewToggle';
import ProductFormModal from './ProductFormModal';

export default function AdminProducts() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [viewMode, setViewMode] = useProductViewMode('sorelle-admin-products-view');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.entities.Product.list('-created_date'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Product.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.toLowerCase().includes(search.toLowerCase()) ||
    p.internal_code?.toLowerCase().includes(search.toLowerCase())
  );

  const stockLabel = (product) => {
    const qty = Number(product.quantity) || 0;
    return qty > 0 ? `${qty} un.` : 'Sem estoque';
  };

  const stockClass = (product) => {
    const qty = Number(product.quantity) || 0;
    return qty > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
  };

  const categoryLabels = {
    casa: 'Casa',
    decoracao: 'Decoração',
    fragancias: 'Fragrâncias',
    cama_mesa_banho: 'Cama, Mesa & Banho',
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setModalOpen(true);
  };

  const handleNew = () => {
    setEditingProduct(null);
    setModalOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl tracking-wider text-foreground">Produtos</h1>
          <p className="font-body text-muted-foreground mt-1">{products.length} produtos cadastrados</p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-sm font-body text-sm tracking-wider hover:opacity-80 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Novo Produto
        </button>
      </div>

      {/* Search + view toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome ou categoria..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <ProductViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      {viewMode === 'grid' ? (
        <div className="flex flex-wrap gap-4">
          {isLoading ? (
            Array(12).fill(0).map((_, i) => (
              <div key={i} className="w-[200px] shrink-0 animate-pulse">
                <div className="w-[200px] h-[200px] bg-secondary border border-border rounded-sm" />
                <div className="mt-2 space-y-2">
                  <div className="h-3 bg-secondary rounded w-full" />
                  <div className="h-6 bg-secondary rounded w-2/3" />
                </div>
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="w-full py-12 text-center font-body text-muted-foreground bg-card border border-border rounded-sm">
              Nenhum produto encontrado.
            </div>
          ) : (
            filtered.map((product) => (
              <div key={product.id} className="w-[200px] shrink-0">
                <div className="w-[200px] h-[200px] bg-secondary border border-border rounded-sm overflow-hidden">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground font-body text-xs">
                      Sem imagem
                    </div>
                  )}
                </div>

                <div className="mt-2 space-y-2">
                  <h3 className="font-display text-sm tracking-wide text-foreground line-clamp-2 min-h-[2.5rem]">
                    {product.name}
                  </h3>

                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-body shrink-0 ${stockClass(product)}`}>
                      {stockLabel(product)}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEdit(product)}
                        className="inline-flex items-center gap-1 px-2 py-1 border border-border rounded-sm font-body text-[10px] hover:bg-secondary transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-3 h-3" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (confirm('Excluir este produto?')) deleteMutation.mutate(product.id); }}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
      <div className="bg-card border border-border rounded-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-secondary/50 border-b border-border">
              <tr>
                <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Produto</th>
                <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase hidden md:table-cell">Categoria</th>
                <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Preço</th>
                <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase hidden lg:table-cell">Estoque</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(product => (
                <tr key={product.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {product.image_url && (
                        <img src={product.image_url} alt={product.name} className="w-10 h-10 object-cover rounded-sm bg-secondary" />
                      )}
                      <div>
                        <p className="font-body text-sm text-foreground font-medium">{product.name}</p>
                        {product.internal_code && (
                          <p className="font-body text-xs text-muted-foreground">{product.internal_code}</p>
                        )}
                        {product.subcategory && <p className="font-body text-xs text-muted-foreground">{product.subcategory}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    <span className="font-body text-xs text-muted-foreground">{categoryLabels[product.category] || product.category}</span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-body text-sm text-foreground">R$ {product.price?.toFixed(2).replace('.', ',')}</p>
                    {product.original_price && (
                      <p className="font-body text-xs text-muted-foreground line-through">R$ {product.original_price?.toFixed(2).replace('.', ',')}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-body ${stockClass(product)}`}>
                      {stockLabel(product)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => handleEdit(product)}
                        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { if (confirm('Excluir este produto?')) deleteMutation.mutate(product.id); }}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center font-body text-muted-foreground">
                    Nenhum produto encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      )}

      {modalOpen && (
        <ProductFormModal
          key={editingProduct?.id || 'new'}
          product={editingProduct}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}