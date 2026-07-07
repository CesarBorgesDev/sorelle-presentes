import React, { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import CustomerOrderDetail from '@/components/CustomerOrderDetail';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  formatOrderDate,
  formatMoney,
} from '@/lib/orderLabels';
import {
  RMA_REASON_LABELS,
  RMA_STATUS_LABELS,
  RMA_STATUS_COLORS,
} from '@/lib/rmaLabels';
import {
  Loader2,
  ShoppingBag,
  LogOut,
  ChevronRight,
  User,
  Heart,
  RotateCcw,
  Trash2,
  Save,
} from 'lucide-react';

function ProfileForm({ profile, onSaved }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    document: '',
    address: '',
  });

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        document: profile.document || '',
        address: profile.address || '',
      });
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: (data) => api.account.updateProfile(data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['account-profile'], updated);
      queryClient.invalidateQueries({ queryKey: ['auth-me'] });
      onSaved?.(updated);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  return (
    <form onSubmit={handleSubmit} className="p-5 space-y-4">
      <div>
        <label className="block font-body text-xs text-muted-foreground mb-1.5">Nome completo</label>
        <input
          type="text"
          value={form.full_name}
          onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          className="w-full px-3 py-2 border border-border rounded-sm font-body text-sm bg-background"
          placeholder="Seu nome"
        />
      </div>
      <div>
        <label className="block font-body text-xs text-muted-foreground mb-1.5">Telefone</label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className="w-full px-3 py-2 border border-border rounded-sm font-body text-sm bg-background"
          placeholder="(11) 99999-9999"
        />
      </div>
      <div>
        <label className="block font-body text-xs text-muted-foreground mb-1.5">CPF / CNPJ</label>
        <input
          type="text"
          value={form.document}
          onChange={(e) => setForm((f) => ({ ...f, document: e.target.value }))}
          className="w-full px-3 py-2 border border-border rounded-sm font-body text-sm bg-background"
          placeholder="000.000.000-00"
        />
      </div>
      <div>
        <label className="block font-body text-xs text-muted-foreground mb-1.5">Endereço</label>
        <textarea
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2 border border-border rounded-sm font-body text-sm bg-background resize-none"
          placeholder="Rua, número, bairro, cidade, UF"
        />
      </div>
      {saveMutation.isError && (
        <p className="font-body text-sm text-destructive">
          {saveMutation.error?.message || 'Erro ao salvar'}
        </p>
      )}
      {saveMutation.isSuccess && (
        <p className="font-body text-sm text-emerald-600">Dados salvos com sucesso.</p>
      )}
      <Button type="submit" disabled={saveMutation.isPending} className="gap-2">
        {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Salvar alterações
      </Button>
    </form>
  );
}

function WishlistSection() {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['wishlist'],
    queryFn: () => api.account.getWishlist(),
  });

  const removeMutation = useMutation({
    mutationFn: (productId) => api.account.removeFromWishlist(productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wishlist'] }),
  });

  if (isLoading) {
    return (
      <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="font-body text-sm">Carregando lista...</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-12 px-5 text-center">
        <Heart className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="font-body text-muted-foreground mb-4">Sua lista de desejos está vazia.</p>
        <Link
          to="/"
          className="inline-block px-5 py-2.5 bg-primary text-primary-foreground rounded-sm font-body text-sm tracking-wider hover:opacity-80"
        >
          Explorar produtos
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.id} className="px-5 py-4 flex items-center gap-4">
          <Link to={`/produto/${item.product_id}`} className="shrink-0">
            <img
              src={item.image_url}
              alt={item.product_name}
              className="w-16 h-20 object-cover rounded-sm bg-secondary"
            />
          </Link>
          <div className="flex-1 min-w-0">
            <Link
              to={`/produto/${item.product_id}`}
              className="font-display text-sm tracking-wide hover:text-primary line-clamp-2"
            >
              {item.product_name}
            </Link>
            <p className="font-body text-sm mt-1">{formatMoney(item.price)}</p>
            {!item.in_stock && (
              <p className="font-body text-xs text-amber-600 mt-0.5">Fora de estoque</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => removeMutation.mutate(item.product_id)}
            disabled={removeMutation.isPending}
            className="p-2 text-muted-foreground hover:text-destructive transition-colors"
            title="Remover da lista"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function RmaSection({ orders }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ order_id: '', reason: 'defeito', description: '' });

  const eligibleOrders = orders.filter((o) => o.payment_status === 'pago');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['rma-requests'],
    queryFn: () => api.account.getRmaRequests(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.account.createRmaRequest(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rma-requests'] });
      setForm({ order_id: '', reason: 'defeito', description: '' });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  return (
    <div className="divide-y divide-border">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <p className="font-body text-sm text-muted-foreground">
          Solicite devolução ou troca de um pedido pago. Nossa equipe analisará em até 2 dias úteis.
        </p>
        <div>
          <label className="block font-body text-xs text-muted-foreground mb-1.5">Pedido</label>
          <select
            value={form.order_id}
            onChange={(e) => setForm((f) => ({ ...f, order_id: e.target.value }))}
            required
            className="w-full px-3 py-2 border border-border rounded-sm font-body text-sm bg-background"
          >
            <option value="">Selecione um pedido</option>
            {eligibleOrders.map((order) => (
              <option key={order.id} value={order.id}>
                {formatOrderDate(order.created_date)} — {formatMoney(order.total)} ({ORDER_STATUS_LABELS[order.status]})
              </option>
            ))}
          </select>
          {eligibleOrders.length === 0 && (
            <p className="font-body text-xs text-muted-foreground mt-1">
              Nenhum pedido pago disponível para devolução.
            </p>
          )}
        </div>
        <div>
          <label className="block font-body text-xs text-muted-foreground mb-1.5">Motivo</label>
          <select
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            className="w-full px-3 py-2 border border-border rounded-sm font-body text-sm bg-background"
          >
            {Object.entries(RMA_REASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-body text-xs text-muted-foreground mb-1.5">Descrição (opcional)</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-sm font-body text-sm bg-background resize-none"
            placeholder="Descreva o problema ou o que deseja trocar"
          />
        </div>
        {createMutation.isError && (
          <p className="font-body text-sm text-destructive">
            {createMutation.error?.message || 'Erro ao enviar solicitação'}
          </p>
        )}
        <Button type="submit" disabled={createMutation.isPending || !form.order_id} className="gap-2">
          {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          Enviar solicitação
        </Button>
      </form>

      <div className="px-5 py-4">
        <h3 className="font-display text-sm tracking-wide mb-3">Suas solicitações</h3>
        {isLoading ? (
          <div className="py-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="font-body text-sm">Carregando...</span>
          </div>
        ) : requests.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">Nenhuma solicitação registrada.</p>
        ) : (
          <ul className="space-y-3">
            {requests.map((req) => (
              <li key={req.id} className="border border-border rounded-sm p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-body ${RMA_STATUS_COLORS[req.status] || 'bg-secondary'}`}>
                    {RMA_STATUS_LABELS[req.status] || req.status}
                  </span>
                  <span className="font-body text-xs text-muted-foreground">
                    {formatOrderDate(req.created_date)}
                  </span>
                </div>
                <p className="font-body text-sm">{RMA_REASON_LABELS[req.reason] || req.reason}</p>
                {req.description && (
                  <p className="font-body text-xs text-muted-foreground mt-1">{req.description}</p>
                )}
                {req.order_total != null && (
                  <p className="font-body text-xs text-muted-foreground mt-1">
                    Pedido: {formatMoney(req.order_total)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function OrdersSection({ orders, isLoading, onSelectOrder }) {
  if (isLoading) {
    return (
      <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="font-body text-sm">Carregando pedidos...</span>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="py-12 px-5 text-center">
        <p className="font-body text-muted-foreground mb-4">Você ainda não fez nenhum pedido.</p>
        <Link
          to="/"
          className="inline-block px-5 py-2.5 bg-primary text-primary-foreground rounded-sm font-body text-sm tracking-wider hover:opacity-80"
        >
          Explorar produtos
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {orders.map((order) => {
        const itemCount = Array.isArray(order.items)
          ? order.items.reduce((sum, item) => sum + Number(item.quantity || 1), 0)
          : 0;

        return (
          <li key={order.id}>
            <button
              type="button"
              onClick={() => onSelectOrder(order)}
              className="w-full text-left px-5 py-4 hover:bg-secondary/30 transition-colors flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-body ${ORDER_STATUS_COLORS[order.status] || 'bg-secondary'}`}>
                    {ORDER_STATUS_LABELS[order.status] || order.status}
                  </span>
                  {order.payment_status && (
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-body ${PAYMENT_STATUS_COLORS[order.payment_status] || 'bg-secondary text-muted-foreground'}`}>
                      {PAYMENT_STATUS_LABELS[order.payment_status]}
                    </span>
                  )}
                </div>
                <p className="font-body text-sm text-foreground">{formatMoney(order.total)}</p>
                <p className="font-body text-xs text-muted-foreground mt-0.5">
                  {formatOrderDate(order.created_date)}
                  {itemCount > 0 && ` · ${itemCount} item(ns)`}
                  {order.shipping_service_name && ` · ${order.shipping_service_name}`}
                  {order.tracking_code && ` · ${order.tracking_code}`}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function Account() {
  const { user, isAuthenticated, isLoadingAuth, logout, checkUserAuth } = useAuth();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => api.checkout.listMyOrders(),
    enabled: isAuthenticated,
  });

  const { data: profile } = useQuery({
    queryKey: ['account-profile'],
    queryFn: () => api.account.getProfile(),
    enabled: isAuthenticated,
  });

  const handleProfileSaved = (updated) => {
    checkUserAuth();
    queryClient.setQueryData(['account-profile'], updated);
  };

  if (isLoadingAuth) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="font-body">Carregando...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const displayName = profile?.full_name || user?.full_name;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 lg:py-14">
      <div className="mb-8">
        <h1 className="font-display text-3xl tracking-wide mb-1">Minha conta</h1>
        <p className="font-body text-sm text-muted-foreground">
          {displayName ? `${displayName} · ` : ''}{user?.email}
        </p>
      </div>

      <Tabs defaultValue="pedidos" className="mb-6">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 p-1 mb-4 bg-secondary/50">
          <TabsTrigger value="pedidos" className="gap-1.5 font-body text-xs sm:text-sm flex-1 sm:flex-none">
            <ShoppingBag className="w-3.5 h-3.5" />
            Pedidos
          </TabsTrigger>
          <TabsTrigger value="dados" className="gap-1.5 font-body text-xs sm:text-sm flex-1 sm:flex-none">
            <User className="w-3.5 h-3.5" />
            Dados pessoais
          </TabsTrigger>
          <TabsTrigger value="desejos" className="gap-1.5 font-body text-xs sm:text-sm flex-1 sm:flex-none">
            <Heart className="w-3.5 h-3.5" />
            Lista de desejos
          </TabsTrigger>
          <TabsTrigger value="rma" className="gap-1.5 font-body text-xs sm:text-sm flex-1 sm:flex-none">
            <RotateCcw className="w-3.5 h-3.5" />
            Devoluções
          </TabsTrigger>
        </TabsList>

        <div className="bg-card border border-border rounded-sm overflow-hidden">
          <TabsContent value="pedidos" className="mt-0">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-display text-lg tracking-wide">Meus pedidos</h2>
              <span className="font-body text-xs text-muted-foreground">{orders.length} pedido(s)</span>
            </div>
            <OrdersSection
              orders={orders}
              isLoading={ordersLoading}
              onSelectOrder={setSelectedOrder}
            />
          </TabsContent>

          <TabsContent value="dados" className="mt-0">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-display text-lg tracking-wide">Dados pessoais</h2>
              <p className="font-body text-xs text-muted-foreground mt-0.5">
                Usados para agilizar checkout e entregas
              </p>
            </div>
            <ProfileForm profile={profile} onSaved={handleProfileSaved} />
          </TabsContent>

          <TabsContent value="desejos" className="mt-0">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-display text-lg tracking-wide">Lista de desejos</h2>
            </div>
            <WishlistSection />
          </TabsContent>

          <TabsContent value="rma" className="mt-0">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-display text-lg tracking-wide">Devoluções e trocas (RMA)</h2>
            </div>
            <RmaSection orders={orders} />
          </TabsContent>
        </div>
      </Tabs>

      <button
        type="button"
        onClick={() => logout(true)}
        className="inline-flex items-center gap-2 font-body text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Sair da conta
      </button>

      {selectedOrder && (
        <CustomerOrderDetail order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
    </div>
  );
}
