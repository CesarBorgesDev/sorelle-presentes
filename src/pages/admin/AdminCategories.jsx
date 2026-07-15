import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { Plus, Pencil, Trash2, Search, ChevronRight } from 'lucide-react';
import CategoryFormModal from './CategoryFormModal';

export default function AdminCategories() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [parentForNew, setParentForNew] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories-admin'],
    queryFn: () => api.categories.list(true),
  });

  const { data: flatCategories = [] } = useQuery({
    queryKey: ['categories-admin-flat'],
    queryFn: () => api.categories.listFlat(true),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.categories.delete(id),
    onSuccess: () => {
      setDeleteError('');
      queryClient.invalidateQueries({ queryKey: ['categories-admin'] });
      queryClient.invalidateQueries({ queryKey: ['categories-admin-flat'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories-flat'] });
    },
    onError: (err) => {
      setDeleteError(err.message || 'Erro ao excluir categoria');
    },
  });

  const filtered = search
    ? flatCategories.filter((c) => c.name?.toLowerCase().includes(search.toLowerCase()))
    : categories;

  const handleEdit = (category) => {
    setEditingCategory(category);
    setParentForNew(null);
    setModalOpen(true);
  };

  const handleNew = (parentId = null) => {
    setEditingCategory(null);
    setParentForNew(parentId);
    setModalOpen(true);
  };

  const renderCategory = (category, level = 0) => (
    <React.Fragment key={category.id}>
      <tr className="hover:bg-secondary/20 transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-1" style={{ paddingLeft: `${level * 20}px` }}>
            {level > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
            <div>
              <span className="font-body text-sm text-foreground">{category.name}</span>
              {category.description && (
                <p className="font-body text-xs text-muted-foreground mt-0.5 max-w-sm truncate">
                  {category.description}
                </p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 font-body text-xs text-muted-foreground">
          {category.slug}
        </td>
        <td className="px-4 py-3 font-body text-sm text-muted-foreground">
          {category.sort_order ?? 0}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-body ${
            category.active
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}>
            {category.active ? 'Ativa' : 'Inativa'}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            {level === 0 && (
              <button
                type="button"
                onClick={() => handleNew(category.id)}
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-border rounded-sm font-body text-xs hover:bg-secondary transition-colors"
                title="Adicionar subcategoria"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => handleEdit(category)}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-border rounded-sm font-body text-xs hover:bg-secondary transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Excluir a categoria "${category.name}"?`)) {
                  deleteMutation.mutate(category.id);
                }
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-border rounded-sm font-body text-xs text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {category.children?.map((child) => renderCategory(child, level + 1))}
    </React.Fragment>
  );

  const renderFlatCategory = (category) => {
    const parent = flatCategories.find((c) => c.id === category.parent_id);
    return (
      <tr key={category.id} className="hover:bg-secondary/20 transition-colors">
        <td className="px-4 py-3">
          <div>
            <span className="font-body text-sm text-foreground">{category.name}</span>
            {parent && (
              <p className="font-body text-xs text-muted-foreground mt-0.5">
                em {parent.name}
              </p>
            )}
          </div>
        </td>
        <td className="px-4 py-3 font-body text-xs text-muted-foreground">
          {category.slug}
        </td>
        <td className="px-4 py-3 font-body text-sm text-muted-foreground">
          {category.sort_order ?? 0}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-body ${
            category.active
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}>
            {category.active ? 'Ativa' : 'Inativa'}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => handleEdit(category)}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-border rounded-sm font-body text-xs hover:bg-secondary transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Excluir a categoria "${category.name}"?`)) {
                  deleteMutation.mutate(category.id);
                }
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-border rounded-sm font-body text-xs text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl tracking-wider text-foreground">Categorias</h1>
          <p className="font-body text-muted-foreground mt-1">
            Cadastre categorias e subcategorias exibidas na loja
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleNew()}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-sm font-body text-sm tracking-wider hover:opacity-80 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Nova Categoria
        </button>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar categoria..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {deleteError && (
        <p className="font-body text-sm text-destructive mb-4">{deleteError}</p>
      )}

      <div className="bg-card border border-border rounded-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center font-body text-muted-foreground">
            {search ? 'Nenhuma categoria encontrada.' : 'Nenhuma categoria cadastrada.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Categoria</th>
                  <th className="text-left px-4 py-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Slug</th>
                  <th className="text-left px-4 py-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Ordem</th>
                  <th className="text-left px-4 py-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {search
                  ? filtered.map(renderFlatCategory)
                  : filtered.map((c) => renderCategory(c))
                }
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <CategoryFormModal
          category={editingCategory}
          parentId={parentForNew}
          allCategories={flatCategories}
          onClose={() => {
            setModalOpen(false);
            setEditingCategory(null);
            setParentForNew(null);
          }}
        />
      )}
    </div>
  );
}
