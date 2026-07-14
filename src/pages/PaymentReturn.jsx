import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { CheckCircle2, Clock, Loader2, Store } from 'lucide-react';

const paymentStatusLabels = {
  aguardando_pagamento: 'Aguardando confirmação',
  pago: 'Pagamento confirmado',
  recusado: 'Pagamento recusado',
  cancelado: 'Pagamento cancelado',
};

const paymentMethodLabels = {
  pix: 'PIX',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  boleto: 'Boleto',
  dinheiro: 'Dinheiro na retirada',
  pagar_na_loja: 'Pagar na loja',
  test: 'Modo teste',
};

export default function PaymentReturn() {
  const [params] = useSearchParams();
  const orderId = params.get('pedido');

  const { data: order, isLoading } = useQuery({
    queryKey: ['checkout-order', orderId],
    queryFn: () => api.checkout.getOrder(orderId),
    enabled: Boolean(orderId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      if (data.payment_status !== 'aguardando_pagamento') return false;
      if (data.shipping_service_code === 'pickup') return false;
      if (data.payment_method === 'dinheiro' || data.payment_method === 'pagar_na_loja') return false;
      return 5000;
    },
  });

  if (!orderId) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <p className="font-body text-muted-foreground">Pedido não encontrado.</p>
        <Link to="/" className="text-primary hover:underline font-body mt-4 inline-block">Voltar à loja</Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="font-body">Verificando pagamento...</span>
      </div>
    );
  }

  const isPickup = order?.shipping_service_code === 'pickup';
  const payAtPickup = order?.payment_method === 'dinheiro' || order?.payment_method === 'pagar_na_loja';
  const isPaid = order?.payment_status === 'pago';
  const isPickupConfirmed = isPickup && (isPaid || payAtPickup);

  const title = isPickupConfirmed
    ? 'Pedido registrado!'
    : isPaid
      ? 'Pagamento confirmado!'
      : 'Pagamento em processamento';

  const description = isPickupConfirmed
    ? payAtPickup
      ? order.payment_method === 'dinheiro'
        ? 'Seu pedido foi registrado. Leve o valor em dinheiro no momento da retirada.'
        : 'Seu pedido foi registrado. Pague na loja ao retirar — PIX, cartão ou dinheiro.'
      : 'Seu pedido foi confirmado. Aguarde nosso e-mail antes de retirar na loja.'
    : isPaid
      ? 'Seu pedido foi confirmado. Em breve você receberá novidades por e-mail.'
      : 'Estamos aguardando a confirmação da Cielo. Esta página atualiza automaticamente.';

  const Icon = isPickupConfirmed || isPaid ? CheckCircle2 : isPickup ? Store : Clock;

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <Icon className={`w-16 h-16 mx-auto mb-4 ${isPickupConfirmed || isPaid ? 'text-green-600' : 'text-primary'}`} />

      <h1 className="font-display text-2xl tracking-wide mb-2">{title}</h1>

      <p className="font-body text-muted-foreground mb-6">{description}</p>

      {order && (
        <div className="bg-card border border-border rounded-sm p-5 text-left mb-6 font-body text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pedido</span>
            <span className="font-mono text-xs">{order.id?.slice(0, 8)}...</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span>R$ {Number(order.total).toFixed(2).replace('.', ',')}</span>
          </div>
          {order.payment_method && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pagamento</span>
              <span>{paymentMethodLabels[order.payment_method] || order.payment_method}</span>
            </div>
          )}
          {isPickup && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground shrink-0">Retirada</span>
              <span className="text-right">{order.shipping_service_name || order.customer_address}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span>
              {isPickupConfirmed && payAtPickup && !isPaid
                ? 'Aguardando retirada'
                : paymentStatusLabels[order.payment_status] || order.payment_status}
            </span>
          </div>
          {order.payment_method === 'boleto' && !isPaid && order.boleto_url && (
            <div className="pt-2 border-t border-border space-y-2">
              <a
                href={order.boleto_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-primary hover:underline"
              >
                Visualizar / imprimir boleto
              </a>
              {order.boleto_digitable_line && (
                <p className="text-xs text-muted-foreground break-all">
                  Linha digitável: <span className="font-mono">{order.boleto_digitable_line}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <Link to="/conta" className="inline-block px-6 py-3 border border-border rounded-sm font-body text-sm tracking-wider hover:bg-secondary/50 mr-3">
        Meus pedidos
      </Link>
      <Link to="/" className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-sm font-body text-sm tracking-wider hover:opacity-80">
        Voltar à loja
      </Link>
    </div>
  );
}
