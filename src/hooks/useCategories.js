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

/** Mapeia slug de subcategoria para o slug da categoria pai. */
export function buildCategorySlugResolver(flatCategories = []) {
  const byId = new Map(flatCategories.map((category) => [category.id, category]));
  const parentBySlug = new Map();

  for (const category of flatCategories) {
    if (!category.parent_id) continue;
    const parent = byId.get(category.parent_id);
    if (parent) {
      parentBySlug.set(category.slug, parent.slug);
    }
  }

  return (slug) => parentBySlug.get(slug) || slug;
}

/** Agrupa produtos pela categoria pai (inclui subcategorias). */
export function groupProductsByParentCategory(products = [], flatCategories = []) {
  const resolveParentSlug = buildCategorySlugResolver(flatCategories);
  const grouped = {};

  for (const product of products) {
    const key = resolveParentSlug(product.category);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(product);
  }

  return grouped;
}
