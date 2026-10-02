import React, { useState } from 'react';
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

function formatDayShort(iso) {
  const [, month, day] = String(iso || '').split('-');
  return day && month ? `${day}/${month}` : '';
}

function formatDayLong(iso) {
  const [year, month, day] = String(iso || '').split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
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

  const [selectedDay, setSelectedDay] = useState(null);

  const { data: visitorStats } = useQuery({
    queryKey: ['analytics-visitors'],
    queryFn: () => api.analytics.visitors(),
  });

  const { data: visitTimeline = [] } = useQuery({
    queryKey: ['analytics-timeline'],
    queryFn: () => api.analytics.timeline(),
  });

  const { data: visitOrigins = [] } = useQuery({
    queryKey: ['analytics-origins', selectedDay],
    queryFn: () => api.analytics.origins(selectedDay),
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
  const maxOriginVisits = visitOrigins[0]?.visits || visitOrigins[0]?.visitors || 1;
  const maxTimelineVisits = Math.max(1, ...visitTimeline.map((day) => Number(day.visits) || 0));
  const selectedDayStats = visitTimeline.find((day) => day.day === selectedDay);

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

      <div className="bg-card border border-border rounded-sm mb-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            <h2 className="font-display text-lg tracking-wide text-foreground">Linha do tempo de acessos</h2>
          </div>
          <p className="font-body text-xs text-muted-foreground tracking-wider uppercase">Últimos 30 dias</p>
        </div>
        {visitTimeline.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-muted-foreground">Nenhum acesso neste período.</p>
          </div>
        ) : (
          <div className="px-4 pt-4 pb-2 overflow-x-auto">
            <div className="flex items-end gap-1 min-w-[720px] h-44">
              {visitTimeline.map((day) => {
                const visits = Number(day.visits) || 0;
                const selected = selectedDay === day.day;
                const height = visits === 0 ? 4 : Math.max(8, (visits / maxTimelineVisits) * 100);
                return (
                  <button
                    key={day.day}
                    type="button"
                    aria-pressed={selected}
                    title={`${formatDayLong(day.day)}: ${visits} ${visits === 1 ? 'acesso' : 'acessos'}`}
                    onClick={() => setSelectedDay((current) => (current === day.day ? null : day.day))}
                    className="flex-1 min-w-0 h-full flex flex-col items-center gap-1 group"
                  >
                    <span className={`font-body text-[10px] leading-none ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {visits}
                    </span>
                    <span className="flex-1 w-full flex items-end justify-center">
                      <span
                        className={`w-full max-w-6 rounded-sm transition-colors ${selected ? 'bg-primary' : 'bg-primary/35 group-hover:bg-primary/70'}`}
                        style={{ height: `${height}%` }}
                      />
                    </span>
                    <span className={`font-body text-[10px] leading-none ${selected ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                      {formatDayShort(day.day)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="font-body text-xs text-muted-foreground text-center py-3">
              Clique em um dia para ver de onde vieram os acessos.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-card border border-border rounded-sm">
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="w-4 h-4 text-primary shrink-0" />
              <h2 className="font-display text-lg tracking-wide text-foreground truncate">
                {selectedDay ? `Origem em ${formatDayLong(selectedDay)}` : 'Origem dos acessos'}
              </h2>
            </div>
            {selectedDay ? (
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="font-body text-xs text-primary hover:opacity-70 tracking-wider uppercase shrink-0"
              >
                Ver 30 dias
              </button>
            ) : (
              <p className="font-body text-xs text-muted-foreground tracking-wider uppercase shrink-0">Últimos 30 dias</p>
            )}
          </div>
          {selectedDay && selectedDayStats ? (
            <p className="px-6 pt-4 font-body text-xs text-muted-foreground">
              {selectedDayStats.visits} {selectedDayStats.visits === 1 ? 'acesso' : 'acessos'}
              {' · '}
              {selectedDayStats.visitors} {selectedDayStats.visitors === 1 ? 'visitante' : 'visitantes'}
            </p>
          ) : null}
          {visitOrigins.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-body text-muted-foreground">
                {selectedDay ? 'Nenhum acesso neste dia.' : 'Nenhum acesso com localização neste período.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visitOrigins.map((origin) => {
                const visits = Number(origin.visits ?? origin.visitors) || 0;
                return (
                  <div key={`${origin.city}-${origin.region}-${origin.country}`} className="px-6 py-4">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <div>
                        <p className="font-body text-sm text-foreground font-medium">{formatLocation(origin)}</p>
                        {origin.country ? (
                          <p className="font-body text-xs text-muted-foreground">{origin.country}</p>
                        ) : null}
                      </div>
                      <p className="font-body text-sm text-foreground whitespace-nowrap text-right">
                        {visits} {visits === 1 ? 'acesso' : 'acessos'}
                        <span className="block font-body text-xs text-muted-foreground">
                          {origin.visitors} {origin.visitors === 1 ? 'visitante' : 'visitantes'}
                        </span>
                      </p>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.max(6, (visits / maxOriginVisits) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
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
