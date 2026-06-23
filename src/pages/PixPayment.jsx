import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, Clock, Copy, Loader2, QrCode } from 'lucide-react';

const paymentStatusLabels = {
  aguardando_pagamento: 'Aguardando confirmação',
  pago: 'Pagamento confirmado',
  recusado: 'Pagamento recusado',
  cancelado: 'Pagamento cancelado',
};

export default function PixPayment() {
  const [params] = useSearchParams();
  const orderId = params.get('pedido');
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['pix-payment', orderId],
    queryFn: () => base44.checkout.getPixDetails(orderId),
    enabled: Boolean(orderId),
    refetchInterval: (query) => (
      query.state.data?.payment_status === 'aguardando_pagamento' ? 8000 : false
    ),
  });

  const copyKey = async () => {
    if (!data?.pix_key) return;
    await navigator.clipboard.writeText(data.pix_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
        <span className="font-body">Carregando dados PIX...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <p className="font-body text-muted-foreground mb-4">{error?.message || 'Não foi possível carregar o PIX.'}</p>
        <Link to="/" className="text-primary hover:underline font-body">Voltar à loja</Link>
      </div>
    );
  }

  const isPaid = data.payment_status === 'pago';

  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <div className="text-center mb-8">
        {isPaid ? (
          <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto mb-4" />
        ) : (
          <QrCode className="w-14 h-14 text-primary mx-auto mb-4" />
        )}
        <h1 className="font-display text-2xl tracking-wide mb-2">
          {isPaid ? 'PIX recebido!' : 'Pague com PIX'}
        </h1>
        <p className="font-body text-sm text-muted-foreground">
          {isPaid
            ? 'Seu pagamento foi registrado. Obrigado pela compra!'
            : 'Transfira o valor exato para a chave abaixo. A confirmação é feita manualmente pela loja.'}
        </p>
      </div>

      <div className="bg-card border border-border rounded-sm p-6 space-y-5 font-body text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Valor</span>
          <span className="font-display text-lg">R$ {Number(data.total).toFixed(2).replace('.', ',')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status</span>
          <span className="inline-flex items-center gap-1">
            {!isPaid && <Clock className="w-3.5 h-3.5" />}
            {paymentStatusLabels[data.payment_status] || data.payment_status}
          </span>
        </div>
        {!isPaid && (
          <>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Titular</p>
              <p className="text-foreground">{data.pix_holder}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Chave PIX</p>
              <div className="flex gap-2">
                <code className="flex-1 p-3 bg-secondary rounded-sm text-xs break-all">{data.pix_key}</code>
                <button
                  type="button"
                  onClick={copyKey}
                  className="shrink-0 px-3 py-2 border border-border rounded-sm hover:bg-secondary transition-colors"
                  title="Copiar chave"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              {copied && <p className="text-xs text-green-600 mt-1">Chave copiada!</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              Após o pagamento, guarde o comprovante. Você receberá confirmação por e-mail assim que identificarmos a transferência.
            </p>
          </>
        )}
      </div>

      <div className="text-center mt-8">
        <Link to="/" className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-sm font-body text-sm tracking-wider hover:opacity-80">
          Voltar à loja
        </Link>
      </div>
    </div>
  );
}
