import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { Search, ChevronDown, Plus } from 'lucide-react';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
} from '@/lib/orderLabels';
import OrderFormModal from './OrderFormModal';
import OrderDetailModal from './OrderDetailModal';

const STATUS_OPTIONS = ['pendente', 'confirmado', 'em_preparo', 'enviado', 'entregue', 'cancelado'];

export default function AdminOrders() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [formOpen, setFormOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.entities.Order.list('-created_date', 100),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => api.entities.Order.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });

  const filtered = orders.filter((o) => {
    const matchSearch = o.customer_name?.toLowerCase().includes(search.toLowerCase())
      || o.customer_email?.toLowerCase().includes(search.toLowerCase())
      || o.tracking_code?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'todos' || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl tracking-wider text-foreground">Pedidos</h1>
          <p className="font-body text-muted-foreground mt-1">{orders.length} pedidos no total</p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-sm font-body text-sm tracking-wider hover:opacity-80 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Novo Pedido
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por cliente, e-mail ou rastreio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="relative">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="pl-4 pr-8 py-2.5 bg-card border border-border rounded-sm font-body text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none"
          >
            <option value="todos">Todos os status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      <div className="bg-card border border-border rounded-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Cliente</th>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase hidden md:table-cell">Data</th>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Total</th>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Pagamento</th>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => setDetailOrder(order)}>
                    <td className="px-6 py-4">
                      <p className="font-body text-sm text-foreground font-medium">{order.customer_name}</p>
                      <p className="font-body text-xs text-muted-foreground">{order.customer_email}</p>
                      {order.tracking_code && (
                        <p className="font-mono text-[11px] text-muted-foreground mt-1">{order.tracking_code}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <p className="font-body text-sm text-muted-foreground">{formatDate(order.created_date)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-body text-sm text-foreground">R$ {order.total?.toFixed(2).replace('.', ',')}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-body ${PAYMENT_STATUS_COLORS[order.payment_status] || 'bg-secondary text-foreground'}`}>
                        {PAYMENT_STATUS_LABELS[order.payment_status] || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={order.status}
                        onChange={(e) => updateStatusMutation.mutate({ id: order.id, status: e.target.value })}
                        className={`text-xs px-2.5 py-1 rounded-full font-body border-0 focus:outline-none cursor-pointer ${ORDER_STATUS_COLORS[order.status] || 'bg-secondary text-foreground'}`}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button type="button" className="font-body text-xs text-primary hover:opacity-70 tracking-wider">Ver</button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center font-body text-muted-foreground">
                      Nenhum pedido encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && <OrderFormModal onClose={() => setFormOpen(false)} />}
      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onUpdated={(updated) => {
            setDetailOrder(updated);
            queryClient.invalidateQueries({ queryKey: ['orders'] });
          }}
        />
      )}
    </div>
  );
}
