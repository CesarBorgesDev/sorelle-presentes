import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Package } from 'lucide-react';
import { api } from '@/api/apiClient';
import OrderTrackingPanel from '@/components/OrderTrackingPanel';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  PAYMENT_METHOD_LABELS,
  formatOrderDate,
  formatMoney,
} from '@/lib/orderLabels';

export default function CustomerOrderDetail({ order, onClose }) {
  const [tracking, setTracking] = useState(null);
  const [trackingError, setTrackingError] = useState('');

  const trackMutation = useMutation({
    mutationFn: () => api.checkout.trackOrder(order.id),
    onSuccess: (result) => {
      setTracking(result);
      setTrackingError('');
    },
    onError: (err) => {
      setTrackingError(err.message || 'Erro ao rastrear pedido');
    },
  });

  if (!order) return null;

  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative bg-card border border-border rounded-sm w-full max-w-lg max-h-[90vh] overflow-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 className="font-display text-xl tracking-wide text-foreground">Pedido</h2>
            <p className="font-body text-xs text-muted-foreground mt-0.5">{formatOrderDate(order.created_date)}</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          <div className="flex flex-wrap gap-2">
            <span className={`text-xs px-3 py-1 rounded-full font-body ${ORDER_STATUS_COLORS[order.status] || 'bg-secondary text-foreground'}`}>
              {ORDER_STATUS_LABELS[order.status] || order.status}
            </span>
            {order.payment_status && (
              <span className={`text-xs px-3 py-1 rounded-full font-body ${PAYMENT_STATUS_COLORS[order.payment_status] || 'bg-secondary text-muted-foreground'}`}>
                {PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-sm bg-secondary/40 border border-border font-body text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Pagamento</p>
              <p className="text-foreground">{PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Status do pagamento</p>
              <p className="text-foreground">{PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status || '—'}</p>
            </div>
          </div>

          {order.shipping_service_name && (
            <div className="flex items-start gap-3 p-3 rounded-sm bg-secondary/40 border border-border">
              <Package className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="font-body text-sm">
                <p className="text-foreground">{order.shipping_service_name}</p>
                {order.shipping_deadline_days > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Prazo estimado: {order.shipping_deadline_days} dia(s) úteis após envio
                  </p>
                )}
              </div>
            </div>
          )}

          {order.tracking_code && (
            <OrderTrackingPanel
              trackingCode={order.tracking_code}
              tracking={tracking}
              loading={trackMutation.isPending}
              error={trackingError}
              onTrack={() => trackMutation.mutate()}
            />
          )}

          {order.customer_address && (
            <div>
              <p className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-1">Endereço</p>
              <p className="font-body text-sm text-foreground">{order.customer_address}</p>
            </div>
          )}

          {items.length > 0 && (
            <div>
              <p className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-3">Itens</p>
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between gap-3 py-2 border-b border-border last:border-0">
                    <div className="min-w-0">
                      <p className="font-body text-sm text-foreground">{item.product_name}</p>
                      <p className="font-body text-xs text-muted-foreground">
                        {item.quantity} × {formatMoney(item.unit_price)}
                      </p>
                    </div>
                    <p className="font-body text-sm text-foreground shrink-0">{formatMoney(item.total)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-border space-y-1.5 font-body text-sm">
            {Number(order.subtotal) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatMoney(order.subtotal)}</span>
              </div>
            )}
            {Number(order.wrapping_cost) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Embalagem</span>
                <span>{formatMoney(order.wrapping_cost)}</span>
              </div>
            )}
            {Number(order.shipping_cost) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frete</span>
                <span>{formatMoney(order.shipping_cost)}</span>
              </div>
            )}
            <div className="flex justify-between font-medium text-foreground pt-1">
              <span>Total</span>
              <span>{formatMoney(order.total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
