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

export default function ProductPaymentConditions({ price, originalPrice }) {
  const { data: conditions } = useQuery({
    queryKey: ['payment-conditions'],
    queryFn: () => api.checkout.getPaymentConditions(),
    staleTime: 5 * 60 * 1000,
  });

  if (!price) return null;

  const installmentValue = conditions?.shows_installments
    ? calcInstallmentValue(price, conditions.max_installments)
    : null;
  const pixPrice = conditions?.shows_pix_discount
    ? calcPixPrice(price, conditions.pix_discount_percent)
    : null;

  const showSecondaryBlock = installmentValue != null || pixPrice != null;

  return (
    <div className="mb-8">
      {installmentValue != null ? (
        <div className="mb-4">
          <p className="font-body text-2xl lg:text-3xl font-medium text-foreground leading-tight">
            Em até {conditions.max_installments}x de{' '}
            <span className="text-primary">{formatMoney(installmentValue)}</span>
          </p>
          <p className="font-body text-sm text-muted-foreground mt-1">
            sem juros no cartão de crédito
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-4">
          <span className="font-body text-2xl lg:text-3xl font-medium text-foreground">
            {formatMoney(price)}
          </span>
          {originalPrice && (
            <span className="font-body text-sm text-muted-foreground line-through">
              {formatMoney(originalPrice)}
            </span>
          )}
        </div>
      )}

      {showSecondaryBlock && (
        <div className="p-4 border border-border rounded-sm bg-secondary/20 space-y-3">
          <p className="font-body text-xs tracking-[0.2em] uppercase text-muted-foreground">
            Condições de pagamento
          </p>

          {installmentValue != null && (
            <div className="flex items-start gap-3">
              <CreditCard className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="font-body text-sm text-foreground">
                  Valor à vista:{' '}
                  <span className="font-medium">{formatMoney(price)}</span>
                  {originalPrice && (
                    <span className="font-body text-xs text-muted-foreground line-through ml-2">
                      {formatMoney(originalPrice)}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

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
        </div>
      )}
    </div>
  );
}
