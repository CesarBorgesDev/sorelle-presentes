import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, QrCode } from 'lucide-react';
import { api } from '@/api/apiClient';
import { formatMoney } from '@/lib/orderLabels';

function calcPixPrice(price, discountPercent) {
  if (!discountPercent || discountPercent <= 0) return null;
  return Number(price) * (1 - discountPercent / 100);
}

function calcInstallmentValue(price, installments) {
  if (!installments || installments < 2) return null;
  return Number(price) / installments;
}

export default function ProductPaymentConditions({ price }) {
  const { data: conditions } = useQuery({
    queryKey: ['payment-conditions'],
    queryFn: () => api.checkout.getPaymentConditions(),
    staleTime: 5 * 60 * 1000,
  });

  if (!conditions || !price) return null;

  const pixPrice = conditions.shows_pix_discount
    ? calcPixPrice(price, conditions.pix_discount_percent)
    : null;
  const installmentValue = conditions.shows_installments
    ? calcInstallmentValue(price, conditions.max_installments)
    : null;

  if (!pixPrice && !installmentValue) return null;

  return (
    <div className="mb-8 p-4 border border-border rounded-sm bg-secondary/20 space-y-3">
      <p className="font-body text-xs tracking-[0.2em] uppercase text-muted-foreground">
        Condições de pagamento
      </p>

      {pixPrice != null && (
        <div className="flex items-start gap-3">
          <QrCode className="w-4 h-4 mt-0.5 text-primary shrink-0" />
          <div>
            <p className="font-body text-sm text-foreground">
              <span className="font-medium">{conditions.pix_discount_percent}% de desconto no PIX</span>
              {' — '}
              <span className="text-primary font-medium">{formatMoney(pixPrice)}</span>
            </p>
            <p className="font-body text-xs text-muted-foreground mt-0.5">
              Pagamento instantâneo
            </p>
          </div>
        </div>
      )}

      {installmentValue != null && (
        <div className="flex items-start gap-3">
          <CreditCard className="w-4 h-4 mt-0.5 text-primary shrink-0" />
          <div>
            <p className="font-body text-sm text-foreground">
              Em até <span className="font-medium">{conditions.max_installments}x</span> de{' '}
              <span className="font-medium">{formatMoney(installmentValue)}</span> sem juros
            </p>
            <p className="font-body text-xs text-muted-foreground mt-0.5">
              No cartão de crédito
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
