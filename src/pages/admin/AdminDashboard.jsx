import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';
import { Package, ShoppingBag, TrendingUp, Clock, Users, CalendarDays, CalendarRange, Calendar, MapPin, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';

const statusColors = {
  pendente: 'bg-yellow-100 text-yellow-700',
  confirmado: 'bg-blue-100 text-blue-700',
  em_preparo: 'bg-purple-100 text-purple-700',
  enviado: 'bg-indigo-100 text-indigo-700',
  entregue: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
};

function formatLocation(origin) {
  const parts = [origin.city, origin.region].filter(Boolean);
  return parts.join(', ') || 'Não identificado';
}

export default function AdminDashboard() {
  const { data: productCountData } = useQuery({
    queryKey: ['products-count'],
    queryFn: () => api.products.count(),
  });

  const { data: orderStats } = useQuery({
    queryKey: ['orders-stats'],
    queryFn: () => api.orders.stats(),
  });

  const { data: visitorStats } = useQuery({
    queryKey: ['analytics-visitors'],
    queryFn: () => api.analytics.visitors(),
  });

  const { data: visitOrigins = [] } = useQuery({
    queryKey: ['analytics-origins'],
    queryFn: () => api.analytics.origins(),
  });

  const { data: topProducts = [] } = useQuery({
    queryKey: ['analytics-top-products'],
    queryFn: () => api.analytics.topProducts(),
  });

  const { data: recentOrders = [] } = useQuery({
    queryKey: ['orders-recent'],
    queryFn: () => api.entities.Order.list('-created_date', 5),
  });

  const productCount = productCountData?.count ?? 0;
  const totalOrders = orderStats?.total ?? 0;
  const pendingOrders = orderStats?.pending ?? 0;
  const totalRevenue = orderStats?.revenue ?? 0;
  const maxOriginVisitors = visitOrigins[0]?.visitors || 1;

  const stats = [
    { label: 'Produtos Cadastrados', value: productCount, icon: Package, color: 'text-primary' },
    { label: 'Total de Pedidos', value: totalOrders, icon: ShoppingBag, color: 'text-blue-600' },
    { label: 'Receita Total', value: `R$ ${Number(totalRevenue).toFixed(2).replace('.', ',')}`, icon: TrendingUp, color: 'text-green-600' },
    { label: 'Pedidos Pendentes', value: pendingOrders, icon: Clock, color: 'text-yellow-600' },
  ];

  const visitorCards = [
    { label: 'Visitantes no dia', value: visitorStats?.day ?? 0, icon: Users, color: 'text-sky-600' },
    { label: 'Visitantes na semana', value: visitorStats?.week ?? 0, icon: CalendarDays, color: 'text-violet-600' },
    { label: 'Visitantes no mês', value: visitorStats?.month ?? 0, icon: CalendarRange, color: 'text-teal-600' },
    { label: 'Visitantes no ano', value: visitorStats?.year ?? 0, icon: Calendar, color: 'text-rose-600' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl tracking-wider text-foreground">Dashboard</h1>
        <p className="font-body text-muted-foreground mt-1">Visão geral da loja Sorelle</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-body text-xs text-muted-foreground tracking-wider uppercase">{label}</p>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className="font-display text-2xl text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {visitorCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-body text-xs text-muted-foreground tracking-wider uppercase">{label}</p>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className="font-display text-2xl text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-card border border-border rounded-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <h2 className="font-display text-lg tracking-wide text-foreground">Origem dos acessos</h2>
            </div>
            <p className="font-body text-xs text-muted-foreground tracking-wider uppercase">Últimos 30 dias</p>
          </div>
          {visitOrigins.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-body text-muted-foreground">Nenhum acesso com localização neste período.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visitOrigins.map((origin) => (
                <div key={`${origin.city}-${origin.region}-${origin.country}`} className="px-6 py-4">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div>
                      <p className="font-body text-sm text-foreground font-medium">{formatLocation(origin)}</p>
                      {origin.country ? (
                        <p className="font-body text-xs text-muted-foreground">{origin.country}</p>
                      ) : null}
                    </div>
                    <p className="font-body text-sm text-foreground whitespace-nowrap">
                      {origin.visitors} {origin.visitors === 1 ? 'visitante' : 'visitantes'}
                    </p>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.max(6, (origin.visitors / maxOriginVisitors) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              <h2 className="font-display text-lg tracking-wide text-foreground">Produtos mais visitados</h2>
            </div>
            <p className="font-body text-xs text-muted-foreground tracking-wider uppercase">Últimos 30 dias</p>
          </div>
          {topProducts.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-body text-muted-foreground">Nenhuma visita a produtos neste período.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {topProducts.map((product, index) => (
                <Link
                  key={product.id}
                  to={`/produto/${product.id}`}
                  className="flex items-center gap-3 px-6 py-4 hover:bg-secondary/30 transition-colors"
                >
                  <span className="font-display text-sm text-muted-foreground w-5">{index + 1}</span>
                  {product.image_url ? (
                    <img
                      src={resolveMediaUrl(product.image_url)}
                      alt={product.name}
                      className="w-10 h-10 object-cover rounded-sm bg-secondary"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-sm bg-secondary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-sm text-foreground font-medium truncate">{product.name}</p>
                    <p className="font-body text-xs text-muted-foreground">
                      {product.visitors} {product.visitors === 1 ? 'visitante' : 'visitantes'}
                    </p>
                  </div>
                  <p className="font-body text-sm text-foreground whitespace-nowrap">
                    {product.views} {product.views === 1 ? 'visita' : 'visitas'}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display text-lg tracking-wide text-foreground">Pedidos Recentes</h2>
          <Link to="/admin/pedidos" className="font-body text-xs text-primary hover:opacity-70 tracking-wider uppercase">Ver Todos</Link>
        </div>
        {recentOrders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-muted-foreground">Nenhum pedido ainda.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="font-body text-sm text-foreground font-medium">{order.customer_name}</p>
                  <p className="font-body text-xs text-muted-foreground">{order.customer_email}</p>
                </div>
                <div className="text-right flex items-center gap-4">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-body ${statusColors[order.status] || 'bg-secondary text-foreground'}`}>
                    {order.status?.replace('_', ' ')}
                  </span>
                  <p className="font-body text-sm text-foreground">R$ {order.total?.toFixed(2).replace('.', ',')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
