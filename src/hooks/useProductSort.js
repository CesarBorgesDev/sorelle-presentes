import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/apiClient';

export const PRODUCT_SORT_OPTIONS = [
  { value: 'name', label: 'Ordem alfabética' },
  { value: 'code', label: 'Código' },
  { value: 'price', label: 'Valor' },
];

/** Preferência de ordenação de produtos configurada no admin. */
export function useProductSortOrder() {
  const { data } = useQuery({
    queryKey: ['public-settings'],
    queryFn: () => api.settings.getPublic(),
    staleTime: 5 * 60 * 1000,
  });
  const value = data?.product_sort_order;
  return PRODUCT_SORT_OPTIONS.some((option) => option.value === value) ? value : 'name';
}

/** Converte a preferência para o parâmetro de sort aceito pela API. */
export function sortOrderToApiSort(order) {
  if (order === 'code') return 'internal_code';
  if (order === 'price') return 'price';
  return 'name';
}

/** Ordena uma lista de produtos no cliente conforme a preferência. */
export function sortProducts(products, order) {
  const sorted = [...products];
  if (order === 'price') {
    sorted.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  } else if (order === 'code') {
    sorted.sort((a, b) => String(a.internal_code || '').localeCompare(String(b.internal_code || ''), 'pt-BR', { numeric: true }));
  } else {
    sorted.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
  }
  return sorted;
}
