import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/apiClient';

/** Categorias ativas da loja em árvore (parent + children). */
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
    staleTime: 5 * 60 * 1000,
  });
}

/** Categorias ativas como lista plana (sem hierarquia). */
export function useCategoriesFlat() {
  return useQuery({
    queryKey: ['categories-flat'],
    queryFn: () => api.categories.listFlat(),
    staleTime: 5 * 60 * 1000,
  });
}

/** Mapa slug -> nome para exibir labels de categoria. */
export function useCategoryLabels() {
  const { data: categories = [] } = useCategoriesFlat();
  const labels = {};
  for (const category of categories) {
    labels[category.slug] = category.name;
  }
  return labels;
}

export function formatCategoryLabel(labels, slug) {
  if (!slug) return '';
  return labels[slug] || String(slug).replace(/_/g, ' ');
}
