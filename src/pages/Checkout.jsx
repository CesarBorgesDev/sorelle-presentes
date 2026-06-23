import React, { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Truck, FlaskConical } from 'lucide-react';

const WRAPPING_PRICES = { none: 0, kraft: 12.9, signature: 29.9 };

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

function formatZip(value) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export default function Checkout() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [error, setError] = useState('');
  const [shippingServiceId, setShippingServiceId] = useState('');
  const [shippingQuote, setShippingQuote] = useState(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');

  const [form, setForm] = useState({
    customer_name: user?.full_name || user?.email?.split('@')[0] || '',
    customer_email: user?.email || '',
    customer_phone: user?.phone || '',
    customer_document: user?.document || '',
    address_street: '',
    address_number: '',
    address_complement: '',
    address_district: '',
    address_city: '',
    address_state: '',
    customer_zip_code: '',
  });

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const { data: items = [], isLoading: cartLoading } = useQuery({
    queryKey: ['cart'],
    queryFn: () => base44.entities.CartItem.list(),
    enabled: isAuthenticated,
  });

  const { data: methodsData, isLoading: methodsLoading } = useQuery({
    queryKey: ['checkout-methods'],
    queryFn: () => base44.checkout.getMethods(),
    enabled: isAuthenticated,
  });

  const { data: profile } = useQuery({
    queryKey: ['account-profile'],
    queryFn: () => base44.account.getProfile(),
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!profile && !user) return;
    setForm((f) => ({
      ...f,
      customer_name: f.customer_name || profile?.full_name || user?.full_name || '',
      customer_phone: f.customer_phone || profile?.phone || user?.phone || '',
      customer_document: f.customer_document || profile?.document || user?.document || '',
    }));
  }, [profile, user]);

  const checkoutMethod = methodsData?.methods?.[0];
  const isTestMode = checkoutMethod?.isTestMode;

  const applyAddressFromCep = useCallback((address) => {
    if (!address) return;
    setForm((f) => ({
      ...f,
      address_street: address.street || '',
      address_district: address.district || '',
      address_city: address.city || '',
      address_state: address.state || '',
    }));
  }, []);

  const fetchCepAndShipping = useCallback(async (zip) => {
    const digits = zip.replace(/\D/g, '');
    if (digits.length !== 8) return;

    setShippingLoading(true);
    setCepLoading(true);
    setShippingError('');
    setCepError('');
    setShippingQuote(null);
    setShippingServiceId('');

    const [quoteResult, addressResult] = await Promise.allSettled([
      base44.shipping.quote(digits),
      base44.shipping.lookupCep(digits),
    ]);

    setCepLoading(false);

    if (addressResult.status === 'fulfilled') {
      applyAddressFromCep(addressResult.value);
    } else {
      setCepError(addressResult.reason?.message || 'CEP não encontrado');
    }

    setShippingLoading(false);

    if (quoteResult.status === 'fulfilled') {
      const quote = quoteResult.value;
      setShippingQuote(quote);
      const firstAvailable = quote.options?.find((o) => o.available);
      if (firstAvailable) setShippingServiceId(firstAvailable.id);
    } else {
      setShippingError(quoteResult.reason?.message || 'Erro ao calcular frete');
    }
  }, [applyAddressFromCep]);

  const subtotal = items.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
  const wrappingTotal = items.reduce((sum, item) => sum + (WRAPPING_PRICES[item.wrapping] || 0), 0);
  const selectedShipping = shippingQuote?.options?.find((o) => o.id === shippingServiceId && o.available);
  const shippingCost = selectedShipping?.price || 0;
  const total = subtotal + wrappingTotal + shippingCost;

  const checkoutMutation = useMutation({
    mutationFn: (data) => base44.checkout.start(data),
    onSuccess: (result) => {
      if (result.type === 'manual_pix') {
        navigate(result.redirect_url || `/pagamento/pix?pedido=${result.order_id}`);
        return;
      }
      if (result.type === 'test') {
        navigate(result.redirect_url || `/pagamento/retorno?pedido=${result.order_id}`);
        return;
      }
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
      }
    },
    onError: (err) => {
      setError(err.message || 'Erro ao iniciar pagamento');
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <p className="font-body text-muted-foreground mb-4">Faça login para finalizar sua compra.</p>
        <Link to="/login" className="text-primary hover:underline font-body">Entrar</Link>
      </div>
    );
  }

  const handleCepChange = (value) => {
    const formatted = formatZip(value);
    set('customer_zip_code', formatted);
    const digits = formatted.replace(/\D/g, '');
    if (digits.length === 8) {
      fetchCepAndShipping(digits);
    } else {
      setShippingQuote(null);
      setShippingServiceId('');
      setShippingError('');
      setCepError('');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!shippingServiceId) {
      setError('Selecione uma opção de frete');
      return;
    }
    checkoutMutation.mutate({
      ...form,
      customer_zip_code: form.customer_zip_code.replace(/\D/g, ''),
      shipping_service_id: shippingServiceId,
    });
  };

  const inputClass = 'w-full px-3 py-2.5 bg-background border border-border rounded-sm font-body text-sm focus:outline-none focus:ring-1 focus:ring-ring';
  const labelClass = 'block font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5';
  const isLoading = cartLoading || methodsLoading;
  const checkoutUnavailable = !isLoading && !checkoutMethod;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 font-body">
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </button>

      <h1 className="font-display text-3xl tracking-wide mb-2">Finalizar Compra</h1>
      <p className="font-body text-sm text-muted-foreground mb-8">
        Informe o CEP, escolha o frete e conclua seu pedido.
      </p>

      {checkoutMethod && (
        <div className={`mb-6 flex items-center gap-2 px-4 py-3 rounded-sm border font-body text-sm ${
          isTestMode
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
            : 'bg-secondary/50 border-border text-muted-foreground'
        }`}>
          {isTestMode ? <FlaskConical className="w-4 h-4 shrink-0" /> : null}
          <span>
            Pagamento: <strong className="text-foreground">{checkoutMethod.label}</strong>
            {isTestMode && ' — pedido aprovado automaticamente (sem cobrança)'}
            {!isTestMode && checkoutMethod.provider === 'cielo' && ' via Cielo'}
            {!isTestMode && checkoutMethod.provider === 'manual_pix' && ' — chave PIX após confirmar'}
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <p className="font-body text-muted-foreground mb-4">Seu carrinho está vazio.</p>
          <Link to="/" className="text-primary hover:underline font-body">Continuar comprando</Link>
        </div>
      ) : checkoutUnavailable ? (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-sm font-body text-sm text-amber-800 dark:text-amber-300">
          Checkout indisponível. O administrador deve configurar Cielo, chave PIX ou modo teste em Admin → Configurações.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-6">
            <div className="space-y-4">
              <div>
                <label className={labelClass}>CEP de entrega *</label>
                <div className="relative">
                  <input
                    required
                    className={inputClass}
                    value={form.customer_zip_code}
                    onChange={(e) => handleCepChange(e.target.value)}
                    placeholder="00000-000"
                  />
                  {cepLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {cepError && (
                  <p className="mt-1.5 text-xs text-destructive font-body">{cepError}</p>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-body text-xs text-muted-foreground tracking-wider uppercase">Endereço de entrega</p>
                  {cepLoading && (
                    <span className="font-body text-xs text-muted-foreground">Atualizando endereço...</span>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Rua / Avenida *</label>
                  <input
                    required
                    className={inputClass}
                    value={form.address_street}
                    onChange={(e) => set('address_street', e.target.value)}
                    placeholder="Nome da rua"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Número *</label>
                    <input
                      required
                      className={inputClass}
                      value={form.address_number}
                      onChange={(e) => set('address_number', e.target.value)}
                      placeholder="123"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Complemento</label>
                    <input
                      className={inputClass}
                      value={form.address_complement}
                      onChange={(e) => set('address_complement', e.target.value)}
                      placeholder="Apto, bloco, etc."
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Bairro *</label>
                  <input
                    required
                    className={inputClass}
                    value={form.address_district}
                    onChange={(e) => set('address_district', e.target.value)}
                    placeholder="Bairro"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px] gap-4">
                  <div>
                    <label className={labelClass}>Cidade *</label>
                    <input
                      required
                      className={inputClass}
                      value={form.address_city}
                      onChange={(e) => set('address_city', e.target.value)}
                      placeholder="Cidade"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>UF *</label>
                    <select
                      required
                      className={inputClass}
                      value={form.address_state}
                      onChange={(e) => set('address_state', e.target.value)}
                    >
                      <option value="">—</option>
                      {BRAZILIAN_STATES.map((uf) => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {(shippingLoading || shippingQuote || shippingError) && (
                <div>
                  <label className={labelClass}>Frete *</label>
                  {shippingLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground font-body py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Calculando frete...
                    </div>
                  )}
                  {shippingError && (
                    <p className="text-sm text-destructive font-body">{shippingError}</p>
                  )}
                  {shippingQuote && !shippingLoading && (
                    <>
                    {shippingQuote.estimated && (
                      <p className="mb-3 px-3 py-2 rounded-sm bg-amber-500/10 border border-amber-500/30 text-xs font-body text-amber-800 dark:text-amber-300">
                        Valores estimados — a API dos Correios está indisponível. Em produção, confira o frete real antes de enviar.
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {shippingQuote.options.filter((o) => o.available).map((option) => {
                        const selected = shippingServiceId === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setShippingServiceId(option.id)}
                            className={`p-4 rounded-sm border text-left transition-colors font-body ${
                              selected
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : 'border-border hover:border-primary/50'
                            }`}
                          >
                            <Truck className={`w-4 h-4 mb-2 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                            <p className="text-sm font-medium">{option.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              R$ {option.price.toFixed(2).replace('.', ',')} · {option.deadline_days} dia(s) úteis
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    </>
                  )}
                </div>
              )}

              <div className="space-y-4 pt-2 border-t border-border">
                <p className="font-body text-xs text-muted-foreground tracking-wider uppercase">Dados pessoais</p>
                <div>
                  <label className={labelClass}>Nome completo *</label>
                  <input required className={inputClass} value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>E-mail *</label>
                  <input required type="email" className={inputClass} value={form.customer_email} onChange={(e) => set('customer_email', e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Telefone *</label>
                    <input required className={inputClass} value={form.customer_phone} onChange={(e) => set('customer_phone', e.target.value)} placeholder="11999999999" />
                  </div>
                  <div>
                    <label className={labelClass}>CPF *</label>
                    <input required className={inputClass} value={form.customer_document} onChange={(e) => set('customer_document', e.target.value)} placeholder="00000000000" />
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-sm bg-destructive/10 text-destructive text-sm font-body">{error}</div>
            )}

            <Button
              type="submit"
              disabled={checkoutMutation.isPending || !shippingServiceId}
              className="w-full py-6 font-body tracking-wider"
            >
              {checkoutMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  {isTestMode ? 'Finalizar pedido de teste' : 'Finalizar compra'} — R$ {total.toFixed(2).replace('.', ',')}
                </>
              )}
            </Button>
          </form>

          <div className="lg:col-span-2 bg-card border border-border rounded-sm p-5 h-fit">
            <h2 className="font-display text-lg tracking-wide mb-4">Resumo</h2>
            <div className="space-y-3 mb-4">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between gap-3 font-body text-sm">
                  <span className="text-foreground truncate">{item.quantity}x {item.product_name}</span>
                  <span className="shrink-0">R$ {(item.price * (item.quantity || 1)).toFixed(2).replace('.', ',')}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-3 space-y-2 font-body text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>R$ {subtotal.toFixed(2).replace('.', ',')}</span></div>
              {wrappingTotal > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Embalagem</span><span>R$ {wrappingTotal.toFixed(2).replace('.', ',')}</span></div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frete</span>
                <span>
                  {selectedShipping
                    ? `R$ ${shippingCost.toFixed(2).replace('.', ',')} (${selectedShipping.label})`
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between font-display text-base pt-2 border-t border-border">
                <span>Total</span>
                <span>R$ {total.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
