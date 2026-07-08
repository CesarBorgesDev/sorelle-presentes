import React, { useState } from 'react';
import { Loader2, Truck } from 'lucide-react';
import { api } from '@/api/apiClient';
import { Button } from '@/components/ui/button';

function formatZip(value) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function formatMoney(value) {
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}

export default function ProductShippingCalculator({ productId, quantity = 1 }) {
  const [zipCode, setZipCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState(null);

  const handleCalculate = async () => {
    const digits = zipCode.replace(/\D/g, '');
    if (digits.length !== 8) {
      setError('Informe um CEP válido com 8 dígitos');
      return;
    }

    setLoading(true);
    setError('');
    setQuote(null);

    try {
      const result = await api.shipping.quoteProduct(productId, quantity, digits);
      setQuote(result);
    } catch (err) {
      setError(err.message || 'Erro ao calcular frete');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-border rounded-sm p-4 bg-secondary/20">
      <div className="flex items-center gap-2 mb-3">
        <Truck className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-display text-sm tracking-widest uppercase text-foreground">
          Calcular frete
        </h3>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={zipCode}
          onChange={(e) => setZipCode(formatZip(e.target.value))}
          placeholder="00000-000"
          className="flex-1 px-3 py-2.5 bg-background border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleCalculate}
          disabled={loading}
          className="font-body text-sm tracking-wider rounded-sm shrink-0"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Calculando...</span>
          ) : (
            'Calcular'
          )}
        </Button>
      </div>

      {error && (
        <p className="font-body text-xs text-destructive mt-3">{error}</p>
      )}

      {quote && (
        <div className="mt-4 space-y-2">
          {quote.estimated && (
            <p className="font-body text-[11px] text-muted-foreground">
              Valores estimados — confira o frete final no checkout.
            </p>
          )}
          {quote.options?.filter((option) => option.available).map((option) => (
            <div
              key={option.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 border border-border rounded-sm bg-background"
            >
              <div>
                <p className="font-body text-sm text-foreground">{option.label}</p>
                {option.deadline_days > 0 && (
                  <p className="font-body text-[11px] text-muted-foreground">
                    até {option.deadline_days} dia(s) úteis
                  </p>
                )}
              </div>
              <p className="font-body text-sm font-medium text-foreground">
                {formatMoney(option.price)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
