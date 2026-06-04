import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Package, ShoppingBag, TrendingUp, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

const statusColors = {
  pendente: 'bg-yellow-100 text-yellow-700',
  confirmado: 'bg-blue-100 text-blue-700',
  em_preparo: 'bg-purple-100 text-purple-700',
  enviado: 'bg-indigo-100 text-indigo-700',
  entregue: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
};

export default function AdminDashboard() {
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list() });
  const { data: orders = [] } = useQuery({ queryKey: ['orders'], queryFn: () => base44.entities.Order.list('-created_date', 50) });

  const totalRevenue = orders.filter(o => o.status !== 'cancelado').reduce((s, o) => s + (o.total || 0), 0);
  const pendingOrders = orders.filter(o => o.status === 'pendente').length;

  const stats = [
    { label: 'Produtos Cadastrados', value: products.length, icon: Package, color: 'text-primary' },
    { label: 'Total de Pedidos', value: orders.length, icon: ShoppingBag, color: 'text-blue-600' },
    { label: 'Receita Total', value: `R$ ${totalRevenue.toFixed(2).replace('.', ',')}`, icon: TrendingUp, color: 'text-green-600' },
    { label: 'Pedidos Pendentes', value: pendingOrders, icon: Clock, color: 'text-yellow-600' },
  ];

  const recentOrders = orders.slice(0, 5);

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl tracking-wider text-foreground">Dashboard</h1>
        <p className="font-body text-muted-foreground mt-1">Visão geral da loja Sorelle</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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

      {/* Recent Orders */}
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
            {recentOrders.map(order => (
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