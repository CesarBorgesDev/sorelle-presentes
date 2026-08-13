import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, Trash2, X } from 'lucide-react';
import { api } from '@/api/apiClient';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  PAYMENT_METHOD_LABELS,
  formatOrderDate,
  formatMoney,
  getOrderDiscount,
  getOrderDiscountLabel,
} from '@/lib/orderLabels';
import { formatZipCodeInput, composeProfileAddress } from '@/lib/profile';
import AddressFields from '@/components/AddressFields';
import { getOrderItemCatalogPath, getOrderItemCode } from '@/lib/orderItemDisplay';
import OrderDetailModal from './OrderDetailModal';

function Field({ label, children }) {
  return (
    <div>
      <p className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1">{label}</p>
      <div className="font-body text-sm text-foreground whitespace-pre-wrap break-words">
        {children || '—'}
      </div>
    </div>
  );
}

function OrderPurchaseCard({ order, onOpen }) {
  const items = Array.isArray(order.items) ? order.items : [];
  const discount = getOrderDiscount(order);

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      <button
        type="button"
        onClick={() => onOpen?.(order)}
        className="w-full text-left px-4 py-3 bg-secondary/40 hover:bg-secondary/70 transition-colors"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-body text-sm text-foreground">{formatOrderDate(order.created_date)}</p>
            <p className="font-body text-xs text-muted-foreground mt-0.5">
              {items.length} item(ns)
              {order.shipping_service_name ? ` · ${order.shipping_service_name}` : ''}
            </p>
          </div>
          <p className="font-body text-sm font-medium">{formatMoney(order.total)}</p>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-body ${ORDER_STATUS_COLORS[order.status] || 'bg-secondary text-muted-foreground'}`}>
            {ORDER_STATUS_LABELS[order.status] || order.status}
          </span>
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-body ${PAYMENT_STATUS_COLORS[order.payment_status] || 'bg-secondary text-muted-foreground'}`}>
            {PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status}
          </span>
          {order.payment_method && (
            <span className="text-xs px-2.5 py-0.5 rounded-full font-body bg-card border border-border text-muted-foreground">
              {PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method}
            </span>
          )}
        </div>
      </button>

      <div className="px-4 py-3 space-y-2">
        {items.length === 0 ? (
          <p className="font-body text-xs text-muted-foreground">Itens não disponíveis neste pedido.</p>
        ) : (
          items.map((item, index) => {
            const code = getOrderItemCode(item);
            const catalogPath = getOrderItemCatalogPath(item);
            return (
              <div key={`${order.id}-${index}`} className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-body text-sm text-foreground">
                    {item.quantity || 1}× {item.product_name || 'Produto'}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                    {code && (
                      <span className="font-mono text-xs text-muted-foreground">Cód. {code}</span>
                    )}
                    {catalogPath && (
                      <Link
                        to={catalogPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 font-body text-xs text-primary hover:underline"
                      >
                        Ver no catálogo
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
                <p className="font-body text-sm text-foreground shrink-0">
                  {formatMoney(item.total ?? (Number(item.unit_price) || 0) * (Number(item.quantity) || 1))}
                </p>
              </div>
            );
          })
        )}

        <div className="pt-2 border-t border-border space-y-1 font-body text-xs">
          {Number(order.subtotal) > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatMoney(order.subtotal)}</span>
            </div>
          )}
          {Number(order.shipping_cost) > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Frete</span>
              <span>{formatMoney(order.shipping_cost)}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <span>{getOrderDiscountLabel(order)}</span>
              <span>- {formatMoney(discount)}</span>
            </div>
          )}
          <div className="flex justify-between font-medium text-foreground pt-0.5">
            <span>{order.payment_status === 'pago' ? 'Total recebido' : 'Total'}</span>
            <span>{formatMoney(order.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CustomerDetailModal({ customerId, onClose, onUpdated, onDeleted }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('compras');
  const [editing, setEditing] = useState(false);
  const [detailOrder, setDetailOrder] = useState(null);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    document: '',
    zip_code: '',
    address_street: '',
    address_district: '',
    address_city: '',
  });

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => api.customers.get(customerId),
    enabled: Boolean(customerId),
  });

  useEffect(() => {
    if (!customer) return;
    setForm({
      full_name: customer.full_name || '',
      phone: customer.phone || '',
      document: customer.document || '',
      zip_code: formatZipCodeInput(customer.zip_code || ''),
      address_street: customer.address_street || '',
      address_district: customer.address_district || '',
      address_city: customer.address_city || '',
    });
    setEditing(false);
    setTab('compras');
  }, [customer]);

  const saveMutation = useMutation({
    mutationFn: (data) => api.customers.update(customerId, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
      setEditing(false);
      onUpdated?.(updated);
    },
    onError: (err) => {
      window.alert(err?.message || 'Não foi possível salvar o cliente.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.customers.delete(customerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onDeleted?.();
      onClose?.();
    },
    onError: (err) => {
      window.alert(err?.message || 'Não foi possível excluir o cliente.');
    },
  });

  const handleSave = (e) => {
    e.preventDefault();
    saveMutation.mutate({
      full_name: form.full_name,
      phone: form.phone,
      document: form.document,
      zip_code: form.zip_code,
      address_street: form.address_street,
      address_district: form.address_district,
      address_city: form.address_city,
      address: composeProfileAddress(form),
    });
  };

  const handleDelete = () => {
    if (Number(customer?.orders_count) > 0) {
      window.alert('Não é permitido excluir clientes com vendas ou pedidos registrados.');
      return;
    }
    const label = customer?.full_name || customer?.email || 'este cliente';
    if (!window.confirm(`Excluir o cliente ${label}? Esta ação não pode ser desfeita.`)) return;
    deleteMutation.mutate();
  };

  const orders = Array.isArray(customer?.orders) ? customer.orders : [];
  const canDelete = customer && Number(customer.orders_count) === 0;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-card border border-border rounded-sm w-full max-w-2xl max-h-[90vh] overflow-auto shadow-xl">
          <div className="flex items-center justify-between px-6 py-5 border-b border-border sticky top-0 bg-card z-10">
            <div>
              <h2 className="font-display text-xl tracking-wide text-foreground">
                {customer?.full_name || 'Cliente'}
              </h2>
              <p className="font-body text-xs text-muted-foreground mt-0.5">
                {customer?.email || 'Carregando...'}
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 py-6 space-y-6">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="font-body text-sm">Carregando cliente...</span>
              </div>
            )}

            {error && (
              <p className="font-body text-sm text-destructive">
                {error.message || 'Erro ao carregar cliente'}
              </p>
            )}

            {customer && (
              <>
                <div className="flex flex-wrap gap-2">
                  {customer.has_google && (
                    <span className="text-xs px-3 py-1 rounded-full font-body bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">
                      Login Google
                    </span>
                  )}
                  {customer.data_from_last_order && (
                    <span className="text-xs px-3 py-1 rounded-full font-body bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                      Dados complementados pela última compra
                    </span>
                  )}
                  <span className="text-xs px-3 py-1 rounded-full font-body bg-secondary text-muted-foreground">
                    {customer.orders_count} compra(s)
                  </span>
                  <span className="text-xs px-3 py-1 rounded-full font-body bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300">
                    {formatMoney(customer.orders_total)} pagos
                  </span>
                </div>

                <div className="flex gap-1 border-b border-border">
                  <button
                    type="button"
                    onClick={() => { setTab('compras'); setEditing(false); }}
                    className={`px-4 py-2.5 font-body text-sm tracking-wide transition-colors border-b-2 -mb-px ${
                      tab === 'compras'
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Compras ({orders.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('dados')}
                    className={`px-4 py-2.5 font-body text-sm tracking-wide transition-colors border-b-2 -mb-px ${
                      tab === 'dados'
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Dados cadastrais
                  </button>
                </div>

                {tab === 'compras' && (
                  <div className="space-y-4">
                    {orders.length === 0 ? (
                      <p className="font-body text-sm text-muted-foreground py-6 text-center">
                        Este cliente ainda não possui compras.
                      </p>
                    ) : (
                      orders.map((order) => (
                        <OrderPurchaseCard
                          key={order.id}
                          order={order}
                          onOpen={setDetailOrder}
                        />
                      ))
                    )}
                  </div>
                )}

                {tab === 'dados' && !editing && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Nome completo">{customer.full_name}</Field>
                      <Field label="E-mail">{customer.email}</Field>
                      <Field label="Telefone">{customer.phone}</Field>
                      <Field label="CPF/CNPJ">{customer.document_formatted || customer.document}</Field>
                      <Field label="CEP">{customer.zip_code ? formatZipCodeInput(customer.zip_code) : '—'}</Field>
                      <Field label="Logradouro">{customer.address_street}</Field>
                      <Field label="Bairro">{customer.address_district}</Field>
                      <Field label="Cidade">{customer.address_city}</Field>
                      <Field label="Cadastro em">{formatOrderDate(customer.created_date)}</Field>
                      <Field label="Atualizado em">{formatOrderDate(customer.updated_date)}</Field>
                      <Field label="Último pedido">{customer.last_order_date ? formatOrderDate(customer.last_order_date) : '—'}</Field>
                      <Field label="Pedidos pagos">{customer.orders_paid_count}</Field>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={deleteMutation.isPending}
                          className="inline-flex items-center gap-2 px-4 py-2.5 border border-destructive/40 text-destructive rounded-sm font-body text-sm hover:bg-destructive/10 disabled:opacity-50"
                        >
                          {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          Excluir cliente
                        </button>
                      ) : (
                        <p className="font-body text-xs text-muted-foreground">
                          Clientes com pedidos não podem ser excluídos.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="px-4 py-2.5 border border-border rounded-sm font-body text-sm hover:bg-secondary"
                      >
                        Editar dados
                      </button>
                    </div>
                  </>
                )}

                {tab === 'dados' && editing && (
                  <form onSubmit={handleSave} className="space-y-4">
                    <div>
                      <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">
                        Nome completo
                      </label>
                      <input
                        value={form.full_name}
                        onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">
                        E-mail
                      </label>
                      <input
                        value={customer.email}
                        disabled
                        className="w-full px-3 py-2.5 bg-secondary border border-border rounded-sm font-body text-sm text-muted-foreground"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">
                          Telefone
                        </label>
                        <input
                          value={form.phone}
                          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                          className="w-full px-3 py-2.5 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                      <div>
                        <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">
                          CPF/CNPJ
                        </label>
                        <input
                          value={form.document}
                          onChange={(e) => setForm((f) => ({ ...f, document: e.target.value }))}
                          className="w-full px-3 py-2.5 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                    </div>
                    <AddressFields
                      values={form}
                      onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                      inputClassName="w-full px-3 py-2.5 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className="px-4 py-2.5 border border-border rounded-sm font-body text-sm hover:bg-secondary"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={saveMutation.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm font-body text-sm hover:opacity-80 disabled:opacity-50"
                      >
                        {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                        Salvar
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onUpdated={(updated) => {
            setDetailOrder(updated);
            queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            queryClient.invalidateQueries({ queryKey: ['orders'] });
          }}
          onDeleted={() => {
            setDetailOrder(null);
            queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            queryClient.invalidateQueries({ queryKey: ['orders'] });
          }}
        />
      )}
    </>
  );
}
