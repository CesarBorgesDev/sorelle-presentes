import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import {
  AlertCircle, CheckCircle2, Circle, ExternalLink, Loader2, Printer, ScanBarcode, Trash2, X,
} from 'lucide-react';

const STATUS_OPTIONS = ['pendente', 'confirmado', 'em_preparo', 'enviado', 'entregue', 'cancelado'];
const PAYMENT_STATUS_OPTIONS = ['aguardando_pagamento', 'pago', 'recusado', 'cancelado'];

export default function OrderDetailModal({ order, onClose, onUpdated, onDeleted }) {
  const queryClient = useQueryClient();
  const [trackingCode, setTrackingCode] = useState(order.tracking_code || '');
  const [paymentStatus, setPaymentStatus] = useState(order.payment_status || 'aguardando_pagamento');
  const [cieloAuthorization, setCieloAuthorization] = useState(order.cielo_authorization_code || '');
  const [tracking, setTracking] = useState(null);
  const [trackingError, setTrackingError] = useState('');
  const [trackingCodeError, setTrackingCodeError] = useState(null);
  const [labelUrl, setLabelUrl] = useState(order.shipping_label_url || '');
  const [meProtocol, setMeProtocol] = useState(order.melhor_envio_protocol || '');
  const [meLabelError, setMeLabelError] = useState('');
  const [hasInvoicePdf, setHasInvoicePdf] = useState(Boolean(order.has_invoice_pdf));
  const [hasInvoiceXml, setHasInvoiceXml] = useState(Boolean(order.has_invoice_xml));

  const isMelhorEnvioOrder = String(order.shipping_service_code || '').startsWith('me:');

  useEffect(() => {
    setTrackingCode(order.tracking_code || '');
    setPaymentStatus(order.payment_status || 'aguardando_pagamento');
    setCieloAuthorization(order.cielo_authorization_code || '');
    setLabelUrl(order.shipping_label_url || '');
    setMeProtocol(order.melhor_envio_protocol || '');
    setMeLabelError('');
    setHasInvoicePdf(Boolean(order.has_invoice_pdf));
    setHasInvoiceXml(Boolean(order.has_invoice_xml));
    setTracking(null);
    setTrackingError('');
    setTrackingCodeError(null);
  }, [order]);

  const updateMutation = useMutation({
    mutationFn: (data) => api.entities.Order.update(order.id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onUpdated?.(updated);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.entities.Order.delete(order.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onDeleted?.();
    },
  });

  const handleDelete = () => {
    const label = order.customer_name || order.customer_email || 'este pedido';
    if (!window.confirm(`Excluir o pedido de ${label}? Esta ação não pode ser desfeita.`)) return;
    deleteMutation.mutate();
  };

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

  const meLabelMutation = useMutation({
    mutationFn: () => api.orderShipping.generateMelhorEnvioLabel(order.id),
    onSuccess: (result) => {
      setMeLabelError('');
      if (result.label_url) setLabelUrl(result.label_url);
      if (result.tracking_code) setTrackingCode(result.tracking_code);
      if (result.protocol) setMeProtocol(result.protocol);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (result.order) onUpdated?.(result.order);
      if (result.label_url) {
        window.open(result.label_url, '_blank', 'noopener,noreferrer');
      }
    },
    onError: (err) => {
      setMeLabelError(err?.body?.message || err.message || 'Falha ao gerar etiqueta Melhor Envio');
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

  const {
    data: correiosPreflight,
    isLoading: preflightLoading,
    refetch: refetchPreflight,
  } = useQuery({
    queryKey: ['correios-preflight', order.id],
    queryFn: () => api.orderShipping.preflightTrackingCode(order.id),
    staleTime: 30_000,
    enabled: !isMelhorEnvioOrder,
  });

  const trackingCodeMutation = useMutation({
    mutationFn: () => api.orderShipping.generateTrackingCode(order.id),
    onSuccess: (result) => {
      const code = result.tracking_code || '';
      setTrackingCode(code);
      if (!code) {
        setTrackingCodeError({
          message: 'A API respondeu sem código de rastreio.',
          details: [
            'A pré-postagem pode ter sido criada sem atribuir o objeto.',
            'Verifique saldo de etiquetas no CWS e tente novamente.',
          ],
          next_steps: [
            'Confira no CWS o saldo de etiquetas do cartão.',
            'Tente gerar o código novamente em alguns segundos.',
          ],
        });
        return;
      }
      setTrackingCodeError(null);
      if (result.label_url) {
        setLabelUrl(result.label_url);
      }
      if (result.label_error) {
        setTrackingCodeError({
          message: result.label_source === 'correios_pdf'
            ? 'Código gerado, mas houve aviso na etiqueta.'
            : 'Código gerado, mas a etiqueta falhou (PDF oficial indisponível e HTML local também).',
          details: [result.label_error],
          next_steps: ['Use “Gerar etiqueta” manualmente após conferir o código.'],
        });
      }
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['correios-preflight', order.id] });
      if (result.order) {
        onUpdated?.(result.order);
      }
    },
    onError: (err) => {
      const body = err?.body || {};
      const message = body.message || err.message || 'Erro ao gerar código Correios';
      const details = [
        ...(Array.isArray(body.details) ? body.details : []),
        ...(Array.isArray(body.msgs) ? body.msgs : []),
        body.causa,
      ].filter((item) => item && item !== 'null' && item !== 'undefined');

      const safeMessage = !message || message === 'null' || message === 'undefined'
        ? (details[0] || 'Não foi possível gerar o código Correios.')
        : message;

      const uniqueDetails = [...new Set(
        details
          .map((item) => String(item).trim())
          .filter((item) => item && item !== safeMessage && !safeMessage.includes(item))
      )];

      setTrackingCodeError({
        message: safeMessage,
        details: uniqueDetails,
        step: body.step || null,
        step_label: body.step_label || null,
        next_steps: Array.isArray(body.next_steps) ? body.next_steps.filter(Boolean) : [],
      });
      refetchPreflight();
    },
  });

  const canGenerateCorreiosCode = Boolean(correiosPreflight?.ready);

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
              <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">Pedido gateway</p>
              <p className="font-mono text-xs text-foreground break-all">{order.gateway_order_number || '—'}</p>
            </div>
            {order.payment_gateway === 'sipag' && (
              <div className="md:col-span-2">
                <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">Transação SiPag</p>
                <p className="font-mono text-xs text-foreground break-all">{order.sipag_payment_id || '—'}</p>
              </div>
            )}
            {order.payment_gateway === 'mercado_pago' && (
              <>
                <div>
                  <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">Preference MP</p>
                  <p className="font-mono text-xs text-foreground break-all">{order.mercado_pago_preference_id || '—'}</p>
                </div>
                <div>
                  <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">Pagamento MP</p>
                  <p className="font-mono text-xs text-foreground break-all">{order.mercado_pago_payment_id || '—'}</p>
                </div>
              </>
            )}
            <div className="md:col-span-2">
              <label className="block font-body text-xs text-muted-foreground tracking-wider uppercase mb-2">
                {order.payment_gateway === 'sipag'
                  ? 'Autorização SiPag'
                  : order.payment_gateway === 'mercado_pago'
                    ? 'ID pagamento Mercado Pago'
                    : 'Autorização Cielo'}
              </label>
              <input
                className="w-full h-10 px-3 rounded-sm border border-border bg-background font-body text-sm font-mono"
                value={
                  order.payment_gateway === 'sipag'
                    ? (order.sipag_authorization_code || cieloAuthorization)
                    : order.payment_gateway === 'mercado_pago'
                      ? (order.mercado_pago_payment_id || '')
                      : cieloAuthorization
                }
                onChange={(e) => setCieloAuthorization(e.target.value)}
                placeholder="Código de autorização"
                readOnly={order.payment_gateway === 'sipag' || order.payment_gateway === 'mercado_pago'}
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
              <h3 className="font-display text-base tracking-wide text-foreground">
                {isMelhorEnvioOrder ? 'Envio Melhor Envio' : 'Envio Correios'}
              </h3>
              {isMelhorEnvioOrder ? (
                <>
                  <p className="font-body text-xs text-muted-foreground mt-2">
                    Frete cotado via Melhor Envio ({order.shipping_service_name || order.shipping_service_code}).
                    Gera etiqueta comprando saldo da carteira ME (cart → checkout → generate → print).
                  </p>
                  {meProtocol ? (
                    <p className="font-body text-xs text-muted-foreground mt-1">
                      Protocolo: <span className="font-mono text-foreground">{meProtocol}</span>
                    </p>
                  ) : null}
                </>
              ) : (
                <>
              <ol className="mt-2 space-y-1 font-body text-xs text-muted-foreground list-decimal pl-4">
                <li>
                  Configure{' '}
                  <Link to="/admin/configuracoes" className="underline underline-offset-2 hover:text-foreground">
                    Frete → API Correios
                  </Link>
                  {' '}(CWS + cartão + chave de pré-postagem)
                </li>
                <li>
                  Preencha e salve o{' '}
                  <Link to="/admin/configuracoes" className="underline underline-offset-2 hover:text-foreground">
                    Remetente
                  </Link>
                </li>
                <li>Neste pedido (PAC/SEDEX), clique em Gerar código Correios</li>
              </ol>
              <p className="font-body text-[11px] text-muted-foreground mt-2">
                Fluxo oficial: criar pré-postagem → emitir rótulo PDF → obter código. Pode marcar o pedido como Enviado.
              </p>
                </>
              )}
            </div>

            {!isMelhorEnvioOrder && (
            <div className="rounded-sm border border-border/80 bg-secondary/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">
                  Checklist
                </p>
                {preflightLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
              </div>
              {Array.isArray(correiosPreflight?.items) && correiosPreflight.items.length > 0 ? (
                <ul className="space-y-1.5">
                  {correiosPreflight.items.map((item) => (
                    <li key={item.id} className="flex items-start gap-2 font-body text-xs">
                      {item.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      )}
                      <span className={item.ok ? 'text-foreground/80' : 'text-foreground'}>
                        <span className="font-medium">{item.label}</span>
                        {!item.ok && item.help ? (
                          <span className="block text-muted-foreground mt-0.5">{item.help}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                !preflightLoading && (
                  <p className="font-body text-xs text-muted-foreground">
                    Não foi possível carregar o checklist. Tente reabrir o pedido.
                  </p>
                )
              )}
              {correiosPreflight?.service_code_mapped && (
                <p className="font-body text-[11px] text-muted-foreground">
                  Serviço que será enviado: <span className="font-mono">{correiosPreflight.service_code_mapped}</span>
                  {correiosPreflight.destination_zip
                    ? <> · CEP destino <span className="font-mono">{correiosPreflight.destination_zip}</span></>
                    : null}
                </p>
              )}
            </div>
            )}

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

            {meLabelError && (
              <div className="flex items-start gap-2 p-3 rounded-sm border border-destructive/30 bg-destructive/5">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
                <p className="font-body text-xs text-destructive">{meLabelError}</p>
              </div>
            )}

            {!isMelhorEnvioOrder && trackingCodeError && (
              <div className="p-3 rounded-sm border border-destructive/40 bg-destructive/5 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
                  <div className="min-w-0 space-y-1.5">
                    <p className="font-body text-sm text-destructive font-medium">
                      {typeof trackingCodeError === 'string'
                        ? trackingCodeError
                        : trackingCodeError.message}
                    </p>
                    {typeof trackingCodeError === 'object' && (trackingCodeError.step_label || trackingCodeError.step) && (
                      <p className="font-body text-[11px] text-muted-foreground">
                        Etapa: {trackingCodeError.step_label || trackingCodeError.step}
                      </p>
                    )}
                    {typeof trackingCodeError === 'object'
                      && Array.isArray(trackingCodeError.details)
                      && trackingCodeError.details.length > 0 && (
                      <ul className="list-disc pl-4 space-y-1 font-body text-xs text-foreground/90">
                        {trackingCodeError.details.map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                    )}
                    {typeof trackingCodeError === 'object'
                      && Array.isArray(trackingCodeError.next_steps)
                      && trackingCodeError.next_steps.length > 0 && (
                      <div className="pt-1">
                        <p className="font-body text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                          Próximos passos
                        </p>
                        <ol className="list-decimal pl-4 space-y-1 font-body text-xs text-foreground/90">
                          {trackingCodeError.next_steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {isMelhorEnvioOrder ? (
                <button
                  type="button"
                  onClick={() => {
                    setMeLabelError('');
                    meLabelMutation.mutate();
                  }}
                  disabled={meLabelMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm font-body text-sm hover:opacity-90 disabled:opacity-50"
                >
                  {meLabelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                  Gerar etiqueta Melhor Envio
                </button>
              ) : (
                <button
                  type="button"
                  title={
                    canGenerateCorreiosCode
                      ? 'Gerar código pela API de pré-postagem'
                      : 'Complete o checklist acima antes de gerar'
                  }
                  onClick={() => {
                    setTrackingCodeError(null);
                    trackingCodeMutation.mutate();
                  }}
                  disabled={trackingCodeMutation.isPending || preflightLoading || !canGenerateCorreiosCode}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm font-body text-sm hover:opacity-90 disabled:opacity-50"
                >
                  {trackingCodeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanBarcode className="w-4 h-4" />}
                  Gerar código Correios
                </button>
              )}
              {labelUrl && (
                <a
                  href={labelUrl.startsWith('http') ? labelUrl : resolveMediaUrl(labelUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-sm font-body text-sm hover:bg-secondary"
                >
                  Ver etiqueta
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              {!isMelhorEnvioOrder && (
                <button
                  type="button"
                  onClick={() => labelMutation.mutate()}
                  disabled={labelMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-sm font-body text-sm hover:bg-secondary disabled:opacity-50"
                >
                  {labelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                  {trackingCode ? 'Atualizar etiqueta' : 'Gerar etiqueta'}
                </button>
              )}
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

          <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-destructive/40 text-destructive rounded-sm font-body text-sm hover:bg-destructive/10 disabled:opacity-50"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Excluir pedido
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-border rounded-sm font-body text-sm hover:bg-secondary"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
