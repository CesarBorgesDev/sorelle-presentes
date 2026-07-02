import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { CheckCircle2, Clock, Loader2 } from 'lucide-react';

const paymentStatusLabels = {
  aguardando_pagamento: 'Aguardando confirmação',
  pago: 'Pagamento confirmado',
  recusado: 'Pagamento recusado',
  cancelado: 'Pagamento cancelado',
};

export default function PaymentReturn() {
  const [params] = useSearchParams();
  const orderId = params.get('pedido');

  const { data: order, isLoading } = useQuery({
    queryKey: ['checkout-order', orderId],
    queryFn: () => api.checkout.getOrder(orderId),
    enabled: Boolean(orderId),
    refetchInterval: (query) => (
      query.state.data?.payment_status === 'aguardando_pagamento' ? 5000 : false
    ),
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

  const isPaid = order?.payment_status === 'pago';

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      {isPaid ? (
        <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
      ) : (
        <Clock className="w-16 h-16 text-primary mx-auto mb-4" />
      )}

      <h1 className="font-display text-2xl tracking-wide mb-2">
        {isPaid ? 'Pagamento confirmado!' : 'Pagamento em processamento'}
      </h1>

      <p className="font-body text-muted-foreground mb-6">
        {isPaid
          ? 'Seu pedido foi confirmado. Em breve você receberá novidades por e-mail.'
          : 'Estamos aguardando a confirmação da Cielo. Esta página atualiza automaticamente.'}
      </p>

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
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span>{paymentStatusLabels[order.payment_status] || order.payment_status}</span>
          </div>
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
