import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { api } from '@/api/apiClient';
import { formatOrderDate } from '@/lib/orderLabels';

const TYPE_LABELS = {
  venda: 'Venda',
  cancelamento: 'Cancelamento',
  ajuste: 'Ajuste',
  entrada: 'Entrada',
};

const TYPE_COLORS = {
  venda: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  cancelamento: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  ajuste: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  entrada: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
};

function formatDelta(value) {
  const n = Number(value) || 0;
  if (n > 0) return `+${n}`;
  return String(n);
}

export default function ProductStockMovementsModal({ productId, productName, onClose }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['product-stock-movements', productId],
    queryFn: () => api.products.listStockMovements(productId),
    enabled: Boolean(productId),
  });

  const movements = Array.isArray(data?.movements) ? data.movements : [];
  const currentQty = data?.product?.quantity;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-sm w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0">
          <div>
            <h2 className="font-display text-xl tracking-wide text-foreground">Movimentação de estoque</h2>
            <p className="font-body text-xs text-muted-foreground mt-0.5">
              {productName || data?.product?.name || 'Produto'}
              {currentQty != null ? ` · Estoque atual: ${currentQty}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-auto">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="font-body text-sm">Carregando movimentações...</span>
            </div>
          )}

          {error && (
            <p className="font-body text-sm text-destructive">
              {error.message || 'Erro ao carregar movimentações'}
            </p>
          )}

          {!isLoading && !error && movements.length === 0 && (
            <p className="font-body text-sm text-muted-foreground py-8 text-center">
              Nenhuma movimentação registrada para este produto.
            </p>
          )}

          {!isLoading && movements.length > 0 && (
            <div className="border border-border rounded-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/40">
                    <th className="text-left px-4 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Data</th>
                    <th className="text-left px-4 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Tipo</th>
                    <th className="text-right px-4 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Qtd</th>
                    <th className="text-right px-4 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Antes</th>
                    <th className="text-right px-4 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Depois</th>
                    <th className="text-left px-4 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-body text-sm text-foreground whitespace-nowrap">
                        {formatOrderDate(m.created_date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-body ${TYPE_COLORS[m.type] || 'bg-secondary text-muted-foreground'}`}>
                          {TYPE_LABELS[m.type] || m.type}
                        </span>
                      </td>
                      <td className={`px-4 py-3 font-body text-sm text-right font-medium ${
                        Number(m.quantity_delta) < 0
                          ? 'text-red-700 dark:text-red-300'
                          : 'text-emerald-700 dark:text-emerald-300'
                      }`}>
                        {formatDelta(m.quantity_delta)}
                      </td>
                      <td className="px-4 py-3 font-body text-sm text-right text-muted-foreground">
                        {m.quantity_before}
                      </td>
                      <td className="px-4 py-3 font-body text-sm text-right text-foreground">
                        {m.quantity_after}
                      </td>
                      <td className="px-4 py-3 font-body text-xs text-muted-foreground">
                        <div className="space-y-0.5">
                          {m.note && <p>{m.note}</p>}
                          {(m.variant_color || m.variant_size) && (
                            <p>
                              {[m.variant_color, m.variant_size].filter(Boolean).join(' / ')}
                            </p>
                          )}
                          {m.order_id && (
                            <p className="font-mono">Pedido {String(m.order_id).slice(0, 8)}</p>
                          )}
                          {(m.created_by_name || m.created_by_email) && (
                            <p>Por {m.created_by_name || m.created_by_email}</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 border border-border rounded-sm font-body text-sm hover:bg-secondary"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
