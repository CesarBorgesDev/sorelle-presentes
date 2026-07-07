import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { resolveMediaUrl } from '@/lib/resolveMediaUrl';
import OrderTrackingPanel from '@/components/OrderTrackingPanel';
import OrderInvoiceSection from '@/components/OrderInvoiceSection';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  PAYMENT_METHOD_LABELS,
  formatOrderDate,
  formatMoney,
} from '@/lib/orderLabels';
import { ExternalLink, Loader2, Printer, ScanBarcode, X } from 'lucide-react';

const STATUS_OPTIONS = ['pendente', 'confirmado', 'em_preparo', 'enviado', 'entregue', 'cancelado'];
const PAYMENT_STATUS_OPTIONS = ['aguardando_pagamento', 'pago', 'recusado', 'cancelado'];

export default function OrderDetailModal({ order, onClose, onUpdated }) {
  const queryClient = useQueryClient();
  const [trackingCode, setTrackingCode] = useState(order.tracking_code || '');
  const [paymentStatus, setPaymentStatus] = useState(order.payment_status || 'aguardando_pagamento');
  const [cieloAuthorization, setCieloAuthorization] = useState(order.cielo_authorization_code || '');
  const [tracking, setTracking] = useState(null);
  const [trackingError, setTrackingError] = useState('');
  const [trackingCodeError, setTrackingCodeError] = useState('');
  const [labelUrl, setLabelUrl] = useState(order.shipping_label_url || '');
  const [hasInvoicePdf, setHasInvoicePdf] = useState(Boolean(order.has_invoice_pdf));
  const [hasInvoiceXml, setHasInvoiceXml] = useState(Boolean(order.has_invoice_xml));

  useEffect(() => {
    setTrackingCode(order.tracking_code || '');
    setPaymentStatus(order.payment_status || 'aguardando_pagamento');
    setCieloAuthorization(order.cielo_authorization_code || '');
    setLabelUrl(order.shipping_label_url || '');
    setHasInvoicePdf(Boolean(order.has_invoice_pdf));
    setHasInvoiceXml(Boolean(order.has_invoice_xml));
    setTracking(null);
    setTrackingError('');
    setTrackingCodeError('');
  }, [order]);

  const updateMutation = useMutation({
    mutationFn: (data) => api.entities.Order.update(order.id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onUpdated?.(updated);
    },
  });

  const labelMutation = useMutation({
    mutationFn: () => api.orderShipping.generateLabel(order.id, { tracking_code: trackingCode }),
    onSuccess: (result) => {
      setLabelUrl(result.label_url);
      if (result.tracking_code) {
        setTrackingCode(result.tracking_code);
      }
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (result.order) {
        onUpdated?.(result.order);
      }
      window.open(resolveMediaUrl(result.label_url), '_blank', 'noopener,noreferrer');
    },
  });

  const trackMutation = useMutation({
    mutationFn: () => api.orderShipping.track(order.id),
    onSuccess: (result) => {
      setTracking(result);
      setTrackingError('');
    },
    onError: (err) => {
      setTrackingError(err.message || 'Erro ao rastrear pedido');
    },
  });

  const trackingCodeMutation = useMutation({
    mutationFn: () => api.orderShipping.generateTrackingCode(order.id),
    onSuccess: (result) => {
      setTrackingCode(result.tracking_code || '');
      setTrackingCodeError('');
      if (result.label_url) {
        setLabelUrl(result.label_url);
      }
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (result.order) {
        onUpdated?.(result.order);
      }
    },
    onError: (err) => {
      setTrackingCodeError(err.message || 'Erro ao gerar código Correios');
    },
  });

  function saveShippingPayment() {
    updateMutation.mutate({
      tracking_code: trackingCode.trim() || null,
      payment_status: paymentStatus,
      cielo_authorization_code: cieloAuthorization.trim() || null,
      status: trackingCode.trim() ? 'enviado' : order.status,
    });
  }

  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-sm w-full max-w-2xl max-h-[90vh] overflow-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border sticky top-0 bg-card z-10">
          <div>
            <h2 className="font-display text-xl tracking-wide text-foreground">Detalhes do Pedido</h2>
            <p className="font-body text-xs text-muted-foreground mt-0.5">{formatOrderDate(order.created_date)}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          <div className="flex flex-wrap gap-2">
            <span className={`text-xs px-3 py-1 rounded-full font-body ${ORDER_STATUS_COLORS[order.status] || 'bg-secondary text-foreground'}`}>
              {ORDER_STATUS_LABELS[order.status] || order.status}
            </span>
            <span className={`text-xs px-3 py-1 rounded-full font-body ${PAYMENT_STATUS_COLORS[paymentStatus] || 'bg-secondary text-foreground'}`}>
              {PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">
                Status do pedido
              </label>
              <select
                value={order.status}
                onChange={(e) => updateMutation.mutate({ status: e.target.value })}
                className="w-full h-10 px-3 rounded-sm border border-border bg-background font-body text-sm"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{ORDER_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">
                Status do pagamento
              </label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                className="w-full h-10 px-3 rounded-sm border border-border bg-background font-body text-sm"
              >
                {PAYMENT_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{PAYMENT_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-sm border border-border bg-secondary/20">
            <div>
              <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">Pagamento</p>
              <p className="font-body text-sm text-foreground">
                {PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method || '—'}
              </p>
            </div>
            <div>
              <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">Pedido Cielo</p>
              <p className="font-mono text-xs text-foreground break-all">{order.gateway_order_number || '—'}</p>
            </div>
            <div className="md:col-span-2">
              <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">
                Autorização Cielo
              </label>
              <input
                className="w-full h-10 px-3 rounded-sm border border-border bg-background font-body text-sm font-mono"
                value={cieloAuthorization}
                onChange={(e) => setCieloAuthorization(e.target.value)}
                placeholder="Código de autorização (ex.: 123456)"
              />
            </div>
          </div>

          <div>
            <p className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-3">Cliente</p>
            <div className="space-y-1.5">
              <p className="font-body text-sm text-foreground font-medium">{order.customer_name}</p>
              <p className="font-body text-sm text-muted-foreground">{order.customer_email}</p>
              {order.customer_phone && <p className="font-body text-sm text-muted-foreground">{order.customer_phone}</p>}
              {order.customer_address && <p className="font-body text-sm text-muted-foreground">{order.customer_address}</p>}
            </div>
          </div>

          {items.length > 0 && (
            <div>
              <p className="font-body text-xs text-muted-foreground tracking-wider uppercase mb-3">Itens</p>
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                    <div>
                      <p className="font-body text-sm text-foreground">{item.product_name}</p>
                      <p className="font-body text-xs text-muted-foreground">
                        Qtd: {item.quantity} × {formatMoney(item.unit_price)}
                      </p>
                    </div>
                    <p className="font-body text-sm text-foreground">{formatMoney(item.total)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-border space-y-1.5">
            {Number(order.wrapping_cost) > 0 && (
              <div className="flex justify-between font-body text-sm">
                <span className="text-muted-foreground">Embalagem</span>
                <span>{formatMoney(order.wrapping_cost)}</span>
              </div>
            )}
            {Number(order.shipping_cost) > 0 && (
              <div className="flex justify-between font-body text-sm">
                <span className="text-muted-foreground">
                  Frete{order.shipping_service_name ? ` (${order.shipping_service_name})` : ''}
                </span>
                <span>{formatMoney(order.shipping_cost)}</span>
              </div>
            )}
            <div className="flex justify-between font-body text-sm font-medium">
              <span>Total</span>
              <span>{formatMoney(order.total)}</span>
            </div>
          </div>

          <div className="space-y-4 p-4 rounded-sm border border-border">
            <div>
              <h3 className="font-display text-base tracking-wide text-foreground">Envio Correios</h3>
              <p className="font-body text-xs text-muted-foreground mt-1">
                Gere o código de rastreio pela API dos Correios ou informe manualmente após a postagem.
              </p>
            </div>

            <div>
              <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">
                Código de rastreio
              </label>
              <input
                className="w-full h-10 px-3 rounded-sm border border-border bg-background font-body text-sm font-mono uppercase"
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value.toUpperCase())}
                placeholder="AA123456789BR"
              />
            </div>

            {trackingCodeError && (
              <p className="font-body text-xs text-destructive">{trackingCodeError}</p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => trackingCodeMutation.mutate()}
                disabled={trackingCodeMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm font-body text-sm hover:opacity-90 disabled:opacity-50"
              >
                {trackingCodeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanBarcode className="w-4 h-4" />}
                Gerar código Correios
              </button>
              {labelUrl && (
                <a
                  href={resolveMediaUrl(labelUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-sm font-body text-sm hover:bg-secondary"
                >
                  Ver etiqueta
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <button
                type="button"
                onClick={() => labelMutation.mutate()}
                disabled={labelMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-sm font-body text-sm hover:bg-secondary disabled:opacity-50"
              >
                {labelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                {trackingCode ? 'Atualizar etiqueta' : 'Gerar etiqueta'}
              </button>
              <button
                type="button"
                onClick={saveShippingPayment}
                disabled={updateMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-sm font-body text-sm hover:bg-secondary disabled:opacity-50"
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Salvar envio e pagamento
              </button>
            </div>

            <OrderTrackingPanel
              trackingCode={trackingCode}
              tracking={tracking}
              loading={trackMutation.isPending}
              error={trackingError}
              onTrack={() => trackMutation.mutate()}
            />
          </div>

          <OrderInvoiceSection
            orderId={order.id}
            hasInvoicePdf={hasInvoicePdf}
            hasInvoiceXml={hasInvoiceXml}
            mode="admin"
            onUploaded={(updated) => {
              setHasInvoicePdf(Boolean(updated?.has_invoice_pdf));
              setHasInvoiceXml(Boolean(updated?.has_invoice_xml));
              queryClient.invalidateQueries({ queryKey: ['orders'] });
              onUpdated?.(updated);
            }}
          />

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
