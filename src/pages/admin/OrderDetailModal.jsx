import React from 'react';
import { X } from 'lucide-react';

const statusColors = {
  pendente: 'bg-yellow-100 text-yellow-700',
  confirmado: 'bg-blue-100 text-blue-700',
  em_preparo: 'bg-purple-100 text-purple-700',
  enviado: 'bg-indigo-100 text-indigo-700',
  entregue: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
};

const STATUS_OPTIONS = ['pendente', 'confirmado', 'em_preparo', 'enviado', 'entregue', 'cancelado'];

const paymentLabels = { pix: 'PIX', cartao_credito: 'Cartão de Crédito', boleto: 'Boleto' };

export default function OrderDetailModal({ order, onClose, onStatusChange }) {
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-sm w-full max-w-lg max-h-[90vh] overflow-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 className="font-display text-xl tracking-wide text-foreground">Detalhes do Pedido</h2>
            <p className="font-body text-xs text-muted-foreground mt-0.5">{formatDate(order.created_date)}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Status */}
          <div className="flex items-center justify-between">
            <p className="font-body text-xs text-muted-foreground tracking-wider uppercase">Status</p>
            <select
              value={order.status}
              onChange={e => onStatusChange(order.id, e.target.value)}
              className={`text-xs px-3 py-1.5 rounded-full font-body border-0 focus:outline-none cursor-pointer ${statusColors[order.status]}`}
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>

          {/* Customer */}
          <div>
            <p className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-3">Cliente</p>
            <div className="space-y-1.5">
              <p className="font-body text-sm text-foreground font-medium">{order.customer_name}</p>
              <p className="font-body text-sm text-muted-foreground">{order.customer_email}</p>
              {order.customer_phone && <p className="font-body text-sm text-muted-foreground">{order.customer_phone}</p>}
              {order.customer_address && <p className="font-body text-sm text-muted-foreground">{order.customer_address}</p>}
            </div>
          </div>

          {/* Items */}
          {order.items && order.items.length > 0 && (
            <div>
              <p className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-3">Itens</p>
              <div className="space-y-2">
                {order.items.map((item, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                    <div>
                      <p className="font-body text-sm text-foreground">{item.product_name}</p>
                      <p className="font-body text-xs text-muted-foreground">Qtd: {item.quantity} × R$ {item.unit_price?.toFixed(2).replace('.', ',')}</p>
                    </div>
                    <p className="font-body text-sm text-foreground">R$ {item.total?.toFixed(2).replace('.', ',')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="pt-2 border-t border-border space-y-1.5">
            {order.wrapping_cost > 0 && (
              <div className="flex justify-between">
                <p className="font-body text-sm text-muted-foreground">Embalagem</p>
                <p className="font-body text-sm text-muted-foreground">R$ {order.wrapping_cost?.toFixed(2).replace('.', ',')}</p>
              </div>
            )}
            <div className="flex justify-between">
              <p className="font-body text-sm font-medium text-foreground">Total</p>
              <p className="font-body text-sm font-medium text-foreground">R$ {order.total?.toFixed(2).replace('.', ',')}</p>
            </div>
            {order.payment_method && (
              <p className="font-body text-xs text-muted-foreground">{paymentLabels[order.payment_method] || order.payment_method}</p>
            )}
          </div>

          {/* Notes */}
          {order.notes && (
            <div>
              <p className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">Observações</p>
              <p className="font-body text-sm text-muted-foreground">{order.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}