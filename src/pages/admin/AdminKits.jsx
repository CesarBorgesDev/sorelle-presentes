import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import KitFormModal from './KitFormModal';

export default function AdminKits() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingKit, setEditingKit] = useState(null);

  const { data: kits = [], isLoading } = useQuery({
    queryKey: ['product-kits'],
    queryFn: () => api.entities.ProductKit.list('-created_date'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.ProductKit.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['product-kits'] }),
  });

  const filtered = kits.filter((kit) => {
    const term = search.toLowerCase();
    const anchorName = kit.anchor_product?.name?.toLowerCase() || '';
    const relatedNames = (kit.related_products || [])
      .map((p) => p.name?.toLowerCase())
      .join(' ');

    return (
      kit.name?.toLowerCase().includes(term)
      || anchorName.includes(term)
      || relatedNames.includes(term)
    );
  });

  const handleEdit = (kit) => {
    setEditingKit(kit);
    setModalOpen(true);
  };

  const handleNew = () => {
    setEditingKit(null);
    setModalOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl tracking-wider text-foreground">Kits</h1>
          <p className="font-body text-muted-foreground mt-1">
            Associe um produto principal a outros produtos relacionados
          </p>
        </div>
        <button
          type="button"
          onClick={handleNew}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-sm font-body text-sm tracking-wider hover:opacity-80 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Novo Kit
        </button>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar por nome do kit ou produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="bg-card border border-border rounded-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-secondary/50 border-b border-border">
              <tr>
                <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Kit</th>
                <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase hidden md:table-cell">Produto principal</th>
                <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase hidden lg:table-cell">Produtos relacionados</th>
                <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase hidden md:table-cell">Preço do kit</th>
                <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((kit) => (
                <tr key={kit.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-body text-sm text-foreground font-medium">{kit.name}</p>
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    <div className="flex items-center gap-3">
                      {kit.anchor_product?.image_url && (
                        <img
                          src={kit.anchor_product.image_url}
                          alt={kit.anchor_product.name}
                          className="w-10 h-10 object-cover rounded-sm bg-secondary"
                        />
                      )}
                      <p className="font-body text-sm text-foreground">{kit.anchor_product?.name || '—'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
                    <p className="font-body text-sm text-muted-foreground">
                      {(kit.related_products || []).length} produto(s)
                    </p>
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    {kit.price != null ? (
                      <div>
                        <p className="font-body text-sm text-foreground">
                          R$ {Number(kit.price).toFixed(2).replace('.', ',')}
                        </p>
                        {kit.original_price != null && (
                          <p className="font-body text-xs text-muted-foreground line-through">
                            R$ {Number(kit.original_price).toFixed(2).replace('.', ',')}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="font-body text-sm text-muted-foreground">—</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-body ${
                      kit.active ? 'bg-green-100 text-green-700' : 'bg-secondary text-muted-foreground'
                    }`}
                    >
                      {kit.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => handleEdit(kit)}
                        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('Excluir este kit?')) deleteMutation.mutate(kit.id);
                        }}
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
                  <td colSpan={6} className="px-6 py-12 text-center font-body text-muted-foreground">
                    Nenhum kit encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <KitFormModal
          key={editingKit?.id || 'new'}
          kit={editingKit}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
