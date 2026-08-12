import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Trash2, UserCircle } from 'lucide-react';
import { api } from '@/api/apiClient';
import { formatMoney, formatOrderDate } from '@/lib/orderLabels';
import CustomerDetailModal from './CustomerDetailModal';

export default function AdminCustomers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.customers.list({ limit: 500 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.customers.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setSelectedId(null);
    },
    onError: (err) => {
      window.alert(err?.message || 'Não foi possível excluir o cliente.');
    },
  });

  const handleDeleteCustomer = (customer, e) => {
    e?.stopPropagation();
    if (Number(customer.orders_count) > 0) {
      window.alert('Não é permitido excluir clientes com vendas ou pedidos registrados.');
      return;
    }
    const label = customer.full_name || customer.email || 'este cliente';
    if (!window.confirm(`Excluir o cliente ${label}? Esta ação não pode ser desfeita.`)) return;
    deleteMutation.mutate(customer.id);
  };

  const q = search.trim().toLowerCase();
  const filtered = customers.filter((c) => {
    if (!q) return true;
    return [
      c.full_name,
      c.email,
      c.phone,
      c.document,
      c.document_formatted,
      c.address,
    ].some((value) => String(value || '').toLowerCase().includes(q));
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl tracking-wider text-foreground">Clientes</h1>
          <p className="font-body text-muted-foreground mt-1">
            {customers.length} cliente{customers.length === 1 ? '' : 's'} cadastrado{customers.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-card border border-border rounded-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-body text-xs text-muted-foreground tracking-wider uppercase">Total</p>
            <UserCircle className="w-4 h-4 text-primary" />
          </div>
          <p className="font-display text-2xl text-foreground">{customers.length}</p>
        </div>
        <div className="bg-card border border-border rounded-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-body text-xs text-muted-foreground tracking-wider uppercase">Com pedidos</p>
            <UserCircle className="w-4 h-4 text-blue-600" />
          </div>
          <p className="font-display text-2xl text-foreground">
            {customers.filter((c) => c.orders_count > 0).length}
          </p>
        </div>
        <div className="bg-card border border-border rounded-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-body text-xs text-muted-foreground tracking-wider uppercase">Total recebido</p>
            <UserCircle className="w-4 h-4 text-green-600" />
          </div>
          <p className="font-display text-2xl text-foreground">
            {formatMoney(customers.reduce((sum, c) => sum + (Number(c.orders_total) || 0), 0))}
          </p>
        </div>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar por nome, e-mail, telefone, CPF ou endereço..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="bg-card border border-border rounded-sm overflow-hidden">
        {isLoading ? (
          <div className="px-6 py-12 text-center font-body text-muted-foreground">Carregando clientes...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Cliente</th>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Contato</th>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Documento</th>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Pedidos</th>
                  <th className="text-left px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Cadastro</th>
                  <th className="text-right px-6 py-3 font-body text-xs text-muted-foreground tracking-widest uppercase">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => setSelectedId(customer.id)}
                    className="border-b border-border last:border-0 hover:bg-secondary/40 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <p className="font-body text-sm text-foreground">
                        {customer.full_name || 'Sem nome'}
                      </p>
                      <p className="font-body text-xs text-muted-foreground mt-0.5">{customer.email}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {customer.has_google && (
                          <span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-body bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">
                            Google
                          </span>
                        )}
                        {customer.data_from_last_order && (
                          <span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-body bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                            Última compra
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-body text-sm text-foreground">{customer.phone || '—'}</p>
                      <p className="font-body text-xs text-muted-foreground mt-0.5 line-clamp-2 max-w-[220px]">
                        {customer.address || 'Sem endereço'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-body text-sm text-foreground">
                        {customer.document_formatted || customer.document || '—'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-body text-sm text-foreground">{customer.orders_count}</p>
                      <p className="font-body text-xs text-muted-foreground mt-0.5">
                        {formatMoney(customer.orders_total)}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-body text-sm text-foreground">
                        {formatOrderDate(customer.created_date).split(' ')[0]}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedId(customer.id)}
                          className="font-body text-xs text-primary hover:opacity-70 tracking-wider"
                        >
                          Ver
                        </button>
                        {Number(customer.orders_count) === 0 && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteCustomer(customer, e)}
                            disabled={deleteMutation.isPending}
                            className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                            title="Excluir cliente"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center font-body text-muted-foreground">
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedId && (
        <CustomerDetailModal
          customerId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={() => setSelectedId((id) => id)}
          onDeleted={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
