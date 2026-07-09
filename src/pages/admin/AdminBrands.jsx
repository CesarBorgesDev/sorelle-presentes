import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';
import { Plus, Pencil, Trash2, Search, ExternalLink } from 'lucide-react';
import BrandFormModal from './BrandFormModal';

export default function AdminBrands() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);

  const { data: brands = [], isLoading } = useQuery({
    queryKey: ['brands-admin'],
    queryFn: () => api.brands.list(true),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.brands.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands-admin'] });
      queryClient.invalidateQueries({ queryKey: ['brands'] });
    },
  });

  const filtered = brands.filter((brand) =>
    brand.name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (brand) => {
    setEditingBrand(brand);
    setModalOpen(true);
  };

  const handleNew = () => {
    setEditingBrand(null);
    setModalOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl tracking-wider text-foreground">Marcas</h1>
          <p className="font-body text-muted-foreground mt-1">
            Cadastre as marcas exibidas no carrossel da página inicial
          </p>
        </div>
        <button
          type="button"
          onClick={handleNew}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-sm font-body text-sm tracking-wider hover:opacity-80 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Nova Marca
        </button>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar marca..."
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
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center font-body text-muted-foreground">
            {search ? 'Nenhuma marca encontrada.' : 'Nenhuma marca cadastrada.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Marca</th>
                  <th className="text-left px-4 py-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Ordem</th>
                  <th className="text-left px-4 py-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Site</th>
                  <th className="text-right px-4 py-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((brand) => (
                  <tr key={brand.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-sm bg-secondary border border-border flex items-center justify-center overflow-hidden shrink-0">
                          {brand.logo_url ? (
                            <img
                              src={resolveMediaUrl(brand.logo_url)}
                              alt={brand.name}
                              className="max-w-full max-h-full object-contain p-1"
                            />
                          ) : (
                            <span className="font-display text-[10px] tracking-wider text-muted-foreground uppercase text-center px-1">
                              {brand.name?.slice(0, 3)}
                            </span>
                          )}
                        </div>
                        <span className="font-body text-sm text-foreground">{brand.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-body text-sm text-muted-foreground">
                      {brand.sort_order ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-body ${
                        brand.active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {brand.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {brand.website_url ? (
                        <a
                          href={brand.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-body text-xs text-primary hover:underline"
                        >
                          Visitar <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="font-body text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(brand)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 border border-border rounded-sm font-body text-xs hover:bg-secondary transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Excluir a marca "${brand.name}"?`)) {
                              deleteMutation.mutate(brand.id);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 border border-border rounded-sm font-body text-xs text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <BrandFormModal
          brand={editingBrand}
          onClose={() => {
            setModalOpen(false);
            setEditingBrand(null);
          }}
        />
      )}
    </div>
  );
}
