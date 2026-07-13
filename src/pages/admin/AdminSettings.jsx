import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import {
  Settings, Key, Sparkles, Loader2, CheckCircle2,
  CreditCard, Circle, ExternalLink, AlertCircle, Truck, ShoppingBag, Store,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PRODUCT_SORT_OPTIONS } from '@/hooks/useProductSort';

const MODELS = [
  { value: 'flux', label: 'Flux (fallback texto — gratuito)' },
  { value: 'turbo', label: 'Turbo (rápido)' },
  { value: 'nanobanana', label: 'Nano Banana (requer token Pollinations)' },
];

const CIELO_DOCS_URL = 'https://developercielo.github.io/manual/checkout-cielo';

function RequirementItem({ item }) {
  const Icon = item.done ? CheckCircle2 : item.manual ? AlertCircle : Circle;
  const iconClass = item.done
    ? 'text-green-600 dark:text-green-400'
    : item.manual
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-muted-foreground';

  return (
    <li className="flex gap-2.5">
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconClass}`} />
      <div>
        <p className={`font-body text-sm ${item.done ? 'text-foreground' : 'text-muted-foreground'}`}>
          {item.label}
          {item.required && !item.done && <span className="text-destructive ml-1">*</span>}
        </p>
        {item.hint && (
          <p className="font-body text-xs text-muted-foreground mt-0.5 break-all">{item.hint}</p>
        )}
      </div>
    </li>
  );
}

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const [pollinationsKey, setPollinationsKey] = useState('');
  const [hfToken, setHfToken] = useState('');
  const [stableHordeKey, setStableHordeKey] = useState('');
  const [cieloMerchantId, setCieloMerchantId] = useState('');
  const [cieloSoftDescriptor, setCieloSoftDescriptor] = useState('');
  const [cieloFrontendUrl, setCieloFrontendUrl] = useState('');
  const [cieloBackendUrl, setCieloBackendUrl] = useState('');
  const [cieloCheckoutApiUrl, setCieloCheckoutApiUrl] = useState('');
  const [cieloMaxInstallments, setCieloMaxInstallments] = useState('12');
  const [checkoutMethod, setCheckoutMethod] = useState('pix');
  const [enabledPaymentMethods, setEnabledPaymentMethods] = useState(['pix', 'cartao_credito']);
  const [pixKey, setPixKey] = useState('');
  const [pixHolderName, setPixHolderName] = useState('');
  const [pixDiscountPercent, setPixDiscountPercent] = useState('0');
  const [correiosOriginZip, setCorreiosOriginZip] = useState('');
  const [correiosCompanyCode, setCorreiosCompanyCode] = useState('');
  const [correiosPassword, setCorreiosPassword] = useState('');
  const [correiosSenderName, setCorreiosSenderName] = useState('');
  const [correiosSenderStreet, setCorreiosSenderStreet] = useState('');
  const [correiosSenderCity, setCorreiosSenderCity] = useState('');
  const [correiosSenderState, setCorreiosSenderState] = useState('');
  const [correiosSenderPhone, setCorreiosSenderPhone] = useState('');
  const [correiosSenderNumber, setCorreiosSenderNumber] = useState('');
  const [correiosSenderComplement, setCorreiosSenderComplement] = useState('');
  const [correiosSenderDistrict, setCorreiosSenderDistrict] = useState('');
  const [correiosSenderCnpj, setCorreiosSenderCnpj] = useState('');
  const [correiosApiUser, setCorreiosApiUser] = useState('');
  const [correiosApiPassword, setCorreiosApiPassword] = useState('');
  const [correiosPostCard, setCorreiosPostCard] = useState('');
  const [correiosContractNumber, setCorreiosContractNumber] = useState('');
  const [correiosContractDr, setCorreiosContractDr] = useState('');
  const [carrierEnabled, setCarrierEnabled] = useState(false);
  const [carrierName, setCarrierName] = useState('Transportadora');
  const [carrierPrice, setCarrierPrice] = useState('');
  const [carrierDeadlineDays, setCarrierDeadlineDays] = useState('10');
  const [rodonavesEnabled, setRodonavesEnabled] = useState(false);
  const [rodonavesUsername, setRodonavesUsername] = useState('');
  const [rodonavesPassword, setRodonavesPassword] = useState('');
  const [rodonavesCnpj, setRodonavesCnpj] = useState('');
  const [rodonavesLabel, setRodonavesLabel] = useState('Rodonaves');
  const [storePickupEnabled, setStorePickupEnabled] = useState(true);
  const [storePickupLabel, setStorePickupLabel] = useState('Retirar na loja');
  const [storePickupAddress, setStorePickupAddress] = useState('Sacramento - MG');
  const [storePickupInstructions, setStorePickupInstructions] = useState('');
  const [storePickupDeadlineDays, setStorePickupDeadlineDays] = useState('3');
  const [model, setModel] = useState('flux');
  const [productSortOrder, setProductSortOrder] = useState('name');
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.settings.get(),
  });

  React.useEffect(() => {
    if (data?.image_model) setModel(data.image_model);
    if (data?.product_sort_order) setProductSortOrder(data.product_sort_order);
    if (data?.cielo) {
      setCieloSoftDescriptor(data.cielo.softDescriptor || 'SORELLE');
      setCieloFrontendUrl(data.cielo.frontendUrl || '');
      setCieloBackendUrl(data.cielo.backendPublicUrl || '');
      setCieloCheckoutApiUrl(data.cielo.checkoutApiUrl || '');
      setCieloMaxInstallments(String(data.cielo.maxInstallments || 12));
    }
    if (data?.payment) {
      const enabled = Array.isArray(data.payment.payment_methods_enabled) && data.payment.payment_methods_enabled.length
        ? data.payment.payment_methods_enabled
        : [data.payment.checkout_method || 'pix'];
      setEnabledPaymentMethods(enabled);
      setCheckoutMethod(data.payment.checkout_method || enabled[0] || 'pix');
      setPixHolderName(data.payment.pix_holder_name || '');
      setPixDiscountPercent(String(data.payment.pix_discount_percent ?? 0));
      if (data.payment.max_installments) {
        setCieloMaxInstallments(String(data.payment.max_installments));
      }
    }
    if (data?.correios) {
      setCorreiosOriginZip(data.correios.origin_zip || '');
      setCorreiosSenderName(data.correios.sender_name || '');
      setCorreiosSenderStreet(data.correios.sender_street || '');
      setCorreiosSenderCity(data.correios.sender_city || '');
      setCorreiosSenderState(data.correios.sender_state || '');
      setCorreiosSenderPhone(data.correios.sender_phone || '');
      setCorreiosSenderNumber(data.correios.sender_number || '');
      setCorreiosSenderComplement(data.correios.sender_complement || '');
      setCorreiosSenderDistrict(data.correios.sender_district || '');
      setCorreiosSenderCnpj(data.correios.sender_cnpj || '');
      setCorreiosContractNumber(data.correios.contract_number || '');
      if (data.correios.carrier) {
        setCarrierEnabled(Boolean(data.correios.carrier.enabled));
        setCarrierName(data.correios.carrier.label || 'Transportadora');
        setCarrierPrice(data.correios.carrier.price > 0 ? String(data.correios.carrier.price) : '');
        setCarrierDeadlineDays(String(data.correios.carrier.deadlineDays || 10));
      }
    }
    if (data?.rodonaves) {
      setRodonavesEnabled(Boolean(data.rodonaves.enabled));
      setRodonavesUsername(data.rodonaves.username || '');
      setRodonavesCnpj(data.rodonaves.cnpj || '');
      setRodonavesLabel(data.rodonaves.label || 'Rodonaves');
    }
    if (data?.store_pickup) {
      setStorePickupEnabled(Boolean(data.store_pickup.enabled));
      setStorePickupLabel(data.store_pickup.label || 'Retirar na loja');
      setStorePickupAddress(data.store_pickup.address || '');
      setStorePickupInstructions(data.store_pickup.instructions || '');
      setStorePickupDeadlineDays(String(data.store_pickup.deadline_days || 3));
    }
  }, [data?.image_model, data?.product_sort_order, data?.cielo, data?.payment, data?.correios, data?.rodonaves, data?.store_pickup]);

  const mutation = useMutation({
    mutationFn: (payload) => api.settings.update(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      setPollinationsKey('');
      setHfToken('');
      setStableHordeKey('');
      setCieloMerchantId('');
      setPixKey('');
      setCorreiosPassword('');
      setCorreiosApiPassword('');
      setRodonavesPassword('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      image_model: model,
      product_sort_order: productSortOrder,
      cielo_soft_descriptor: cieloSoftDescriptor.trim(),
      cielo_frontend_url: cieloFrontendUrl.trim(),
      cielo_backend_public_url: cieloBackendUrl.trim(),
      cielo_checkout_api_url: cieloCheckoutApiUrl.trim(),
      cielo_max_installments: cieloMaxInstallments,
      checkout_payment_method: enabledPaymentMethods[0] || checkoutMethod,
      payment_methods_enabled: enabledPaymentMethods,
      pix_holder_name: pixHolderName.trim(),
      pix_discount_percent: pixDiscountPercent,
      correios_origin_zip: correiosOriginZip.replace(/\D/g, ''),
      correios_sender_name: correiosSenderName.trim(),
      correios_sender_street: correiosSenderStreet.trim(),
      correios_sender_city: correiosSenderCity.trim(),
      correios_sender_state: correiosSenderState.trim(),
      correios_sender_phone: correiosSenderPhone.trim(),
      correios_sender_number: correiosSenderNumber.trim(),
      correios_sender_complement: correiosSenderComplement.trim(),
      correios_sender_district: correiosSenderDistrict.trim(),
      correios_sender_cnpj: correiosSenderCnpj.replace(/\D/g, ''),
      shipping_carrier_enabled: carrierEnabled,
      shipping_carrier_name: carrierName.trim(),
      shipping_carrier_deadline_days: carrierDeadlineDays,
      rodonaves_enabled: rodonavesEnabled,
      rodonaves_username: rodonavesUsername.trim(),
      rodonaves_cnpj: rodonavesCnpj.replace(/\D/g, ''),
      rodonaves_label: rodonavesLabel.trim() || 'Rodonaves',
      store_pickup_enabled: storePickupEnabled,
      store_pickup_label: storePickupLabel.trim(),
      store_pickup_address: storePickupAddress.trim(),
      store_pickup_instructions: storePickupInstructions.trim(),
      store_pickup_deadline_days: storePickupDeadlineDays,
    };
    if (pollinationsKey.trim()) payload.pollinations_api_key = pollinationsKey.trim();
    if (hfToken.trim()) payload.huggingface_api_token = hfToken.trim();
    if (stableHordeKey.trim()) payload.stable_horde_api_key = stableHordeKey.trim();
    if (cieloMerchantId.trim()) payload.cielo_merchant_id = cieloMerchantId.trim();
    if (pixKey.trim()) payload.pix_key = pixKey.trim();
    if (correiosCompanyCode.trim()) payload.correios_company_code = correiosCompanyCode.trim();
    if (correiosPassword.trim()) payload.correios_password = correiosPassword.trim();
    if (correiosApiUser.trim()) payload.correios_api_user = correiosApiUser.trim();
    if (correiosApiPassword.trim()) payload.correios_api_password = correiosApiPassword.trim();
    if (correiosPostCard.trim()) payload.correios_post_card = correiosPostCard.replace(/\D/g, '');
    if (correiosContractNumber.trim()) payload.correios_contract_number = correiosContractNumber.trim();
    if (correiosContractDr.trim()) payload.correios_contract_dr = correiosContractDr.trim();
    if (carrierPrice.trim()) payload.shipping_carrier_price = carrierPrice.trim().replace(',', '.');
    if (rodonavesPassword.trim()) payload.rodonaves_password = rodonavesPassword.trim();
    mutation.mutate(payload);
  };

  const payment = data?.payment;
  const correios = data?.correios;
  const rodonaves = data?.rodonaves;
  const checkoutOptions = payment?.checkout_options || [
    { id: 'pix', label: 'PIX', hint: 'Cielo ou chave manual' },
    { id: 'cartao_credito', label: 'Cartão de crédito', hint: 'Checkout Cielo' },
    { id: 'boleto', label: 'Boleto bancário', hint: 'Checkout Cielo' },
    { id: 'test', label: 'Modo teste', hint: 'Aprova automaticamente' },
  ];

  const inputClass = 'w-full px-3 py-2.5 bg-background border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';
  const labelClass = 'block font-body text-xs text-muted-foreground tracking-wider uppercase mb-1.5';
  const cielo = data?.cielo;
  const requirements = cielo?.requirements || [];
  const autoDoneCount = requirements.filter((r) => r.done && !r.manual).length;
  const autoTotal = requirements.filter((r) => !r.manual).length;

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="w-6 h-6 text-primary" />
          <h1 className="font-display text-2xl tracking-wide text-foreground">Configurações</h1>
        </div>
        <p className="font-body text-sm text-muted-foreground">
          Pagamentos, frete, Cielo e geração de imagens.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground font-body text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando...
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="checkout" className="w-full">
            <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1 p-1 mb-6 bg-secondary/60">
              <TabsTrigger value="checkout" className="gap-1.5 font-body text-xs sm:text-sm px-3 py-2">
                <ShoppingBag className="w-3.5 h-3.5" />
                Checkout
              </TabsTrigger>
              <TabsTrigger value="frete" className="gap-1.5 font-body text-xs sm:text-sm px-3 py-2">
                <Truck className="w-3.5 h-3.5" />
                Frete
              </TabsTrigger>
              <TabsTrigger value="cielo" className="gap-1.5 font-body text-xs sm:text-sm px-3 py-2">
                <CreditCard className="w-3.5 h-3.5" />
                Cielo
              </TabsTrigger>
              <TabsTrigger value="imagens" className="gap-1.5 font-body text-xs sm:text-sm px-3 py-2">
                <Sparkles className="w-3.5 h-3.5" />
                Imagens
              </TabsTrigger>
              <TabsTrigger value="loja" className="gap-1.5 font-body text-xs sm:text-sm px-3 py-2">
                <Store className="w-3.5 h-3.5" />
                Loja
              </TabsTrigger>
            </TabsList>

            <TabsContent value="loja" className="space-y-6 mt-0 focus-visible:outline-none">
              <div>
                <h2 className="font-display text-lg tracking-wide text-foreground">Exibição de produtos</h2>
                <p className="font-body text-sm text-muted-foreground mt-1">
                  Define a ordem dos produtos na pesquisa e nas páginas de categoria da loja.
                </p>
              </div>

              <div>
                <label className={labelClass}>Ordenação dos produtos</label>
                <select
                  className={inputClass}
                  value={productSortOrder}
                  onChange={(e) => setProductSortOrder(e.target.value)}
                >
                  {PRODUCT_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </TabsContent>

            <TabsContent value="checkout" className="space-y-6 mt-0 focus-visible:outline-none">
              <div>
                <h2 className="font-display text-lg tracking-wide text-foreground">Finalizar compra</h2>
                <p className="font-body text-sm text-muted-foreground mt-1">
                  Escolha quais formas de pagamento o cliente pode selecionar no checkout.
                </p>
              </div>

            {payment?.checkout_config && (
              <div className={`px-3 py-2 rounded-sm text-sm font-body ${
                payment.checkout_config.available
                  ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
              }`}>
                {payment.checkout_config.available
                  ? `${enabledPaymentMethods.length} forma(s) habilitada(s) para o cliente`
                  : 'Checkout indisponível — configure Cielo ou chave PIX abaixo'}
              </div>
            )}

            <div className="space-y-2">
              {checkoutOptions.map((option) => (
                <label
                  key={option.id}
                  className={`flex items-start gap-3 p-4 border rounded-sm cursor-pointer transition-colors ${
                    enabledPaymentMethods.includes(option.id)
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:bg-secondary/30'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={enabledPaymentMethods.includes(option.id)}
                    onChange={() => {
                      setEnabledPaymentMethods((current) => (
                        current.includes(option.id)
                          ? current.filter((id) => id !== option.id)
                          : [...current, option.id]
                      ));
                    }}
                    className="mt-1"
                  />
                  <div>
                    <span className="font-body text-sm font-medium text-foreground">{option.label}</span>
                    {option.hint && (
                      <p className="font-body text-xs text-muted-foreground mt-0.5">{option.hint}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {enabledPaymentMethods.length === 0 && (
              <p className="font-body text-xs text-destructive">
                Selecione ao menos uma forma de pagamento.
              </p>
            )}

            {enabledPaymentMethods.includes('test') && (
              <div className="p-3 rounded-sm bg-amber-500/10 border border-amber-500/30 font-body text-xs text-amber-800 dark:text-amber-300">
                Modo teste aprova pedidos automaticamente, esvazia o carrinho e não cobra nada.
                Use apenas em desenvolvimento ou homologação.
              </div>
            )}

            {enabledPaymentMethods.includes('pix') && (
              <>
                <div>
                  <label className={labelClass}>Chave PIX (pagamento manual)</label>
                  {payment?.has_pix_key && (
                    <p className="font-body text-xs text-muted-foreground mb-2">
                      Chave atual: <span className="font-mono text-foreground">{payment.pix_key_masked}</span>
                    </p>
                  )}
                  <input
                    type="text"
                    className={inputClass}
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    placeholder="Obrigatória se Cielo não estiver configurada"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className={labelClass}>Titular da chave PIX</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={pixHolderName}
                    onChange={(e) => setPixHolderName(e.target.value)}
                    placeholder="Sorelle Presentes"
                  />
                </div>
              </>
            )}

            <div className="pt-4 border-t border-border space-y-4">
              <div>
                <h3 className="font-display text-base tracking-wide text-foreground">Condições na loja</h3>
                <p className="font-body text-xs text-muted-foreground mt-1">
                  Exibidas na página do produto e usadas no checkout (desconto PIX).
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Parcelas no cartão (máximo)</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    className={inputClass}
                    value={cieloMaxInstallments}
                    onChange={(e) => setCieloMaxInstallments(e.target.value)}
                  />
                  <p className="font-body text-xs text-muted-foreground mt-1">
                    Até 12x. Também enviado ao checkout Cielo.
                  </p>
                </div>

                <div>
                  <label className={labelClass}>Desconto no PIX (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    className={inputClass}
                    value={pixDiscountPercent}
                    onChange={(e) => setPixDiscountPercent(e.target.value)}
                  />
                  <p className="font-body text-xs text-muted-foreground mt-1">
                    0 = sem desconto. Aplicado sobre os produtos no checkout PIX.
                  </p>
                </div>
              </div>
            </div>
            </TabsContent>

            <TabsContent value="frete" className="space-y-6 mt-0 focus-visible:outline-none">
              <div>
                <h2 className="font-display text-lg tracking-wide text-foreground">Frete e retirada</h2>
                <p className="font-body text-sm text-muted-foreground mt-1">
                  Correios (PAC/SEDEX), transportadora própria, Rodonaves e retirada na loja.
                </p>
              </div>

            <div className="p-4 border border-border rounded-sm space-y-4 bg-secondary/20">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={storePickupEnabled}
                  onChange={(e) => setStorePickupEnabled(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="font-body text-sm text-foreground">Oferecer retirada na loja no checkout</span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Nome da opção</label>
                  <input className={inputClass} value={storePickupLabel} onChange={(e) => setStorePickupLabel(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Prazo (dias úteis)</label>
                  <input type="number" min="1" className={inputClass} value={storePickupDeadlineDays} onChange={(e) => setStorePickupDeadlineDays(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Endereço da loja</label>
                <input className={inputClass} value={storePickupAddress} onChange={(e) => setStorePickupAddress(e.target.value)} placeholder="Rua, número, cidade - UF" />
              </div>
              <div>
                <label className={labelClass}>Instruções para o cliente</label>
                <textarea rows={2} className={inputClass} value={storePickupInstructions} onChange={(e) => setStorePickupInstructions(e.target.value)} placeholder="Ex: Aguarde confirmação por e-mail antes de retirar." />
              </div>
            </div>

            <div>
              <label className={labelClass}>CEP de origem *</label>
              <input
                type="text"
                className={inputClass}
                value={correiosOriginZip}
                onChange={(e) => setCorreiosOriginZip(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="01310100"
              />
              <p className="font-body text-xs text-muted-foreground mt-1">
                CEP de onde os produtos são despachados.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Código da empresa (opcional)</label>
                <input
                  type="text"
                  className={inputClass}
                  value={correiosCompanyCode}
                  onChange={(e) => setCorreiosCompanyCode(e.target.value)}
                  placeholder="Contrato Correios"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className={labelClass}>Senha do contrato (opcional)</label>
                <input
                  type="password"
                  className={inputClass}
                  value={correiosPassword}
                  onChange={(e) => setCorreiosPassword(e.target.value)}
                  placeholder="Senha API Correios"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-border space-y-4">
              <div>
                <h3 className="font-display text-base tracking-wide text-foreground">Pré-postagem (gerar código)</h3>
                <p className="font-body text-sm text-muted-foreground mt-1">
                  Credenciais do Meu Correios/CWS e cartão de postagem para gerar o rastreio automaticamente no admin.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Cartão de postagem</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={correiosPostCard}
                    onChange={(e) => setCorreiosPostCard(e.target.value.replace(/\D/g, '').slice(0, 20))}
                    placeholder={correios?.post_card_masked || 'Número do cartão'}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={labelClass}>Contrato comercial</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={correiosContractNumber}
                    onChange={(e) => setCorreiosContractNumber(e.target.value)}
                    placeholder={correios?.contract_number || 'Número do contrato'}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={labelClass}>DR / Superintendência (opcional)</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={correiosContractDr}
                    onChange={(e) => setCorreiosContractDr(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    placeholder="Ex.: 10"
                  />
                </div>
                <div>
                  <label className={labelClass}>Usuário API Correios</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={correiosApiUser}
                    onChange={(e) => setCorreiosApiUser(e.target.value)}
                    placeholder="IdCorreios / Meu Correios"
                    autoComplete="off"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Senha API Correios</label>
                  <input
                    type="password"
                    className={inputClass}
                    value={correiosApiPassword}
                    onChange={(e) => setCorreiosApiPassword(e.target.value)}
                    placeholder="Código de acesso gerado no CWS"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border space-y-4">
              <div>
                <h3 className="font-display text-base tracking-wide text-foreground">Remetente (etiqueta)</h3>
                <p className="font-body text-sm text-muted-foreground mt-1">
                  Dados enviados na pré-postagem e impressos na etiqueta.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Nome do remetente</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={correiosSenderName}
                    onChange={(e) => setCorreiosSenderName(e.target.value)}
                    placeholder="Sorelle Presentes"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Logradouro</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={correiosSenderStreet}
                    onChange={(e) => setCorreiosSenderStreet(e.target.value)}
                    placeholder="Rua Exemplo"
                  />
                </div>
                <div>
                  <label className={labelClass}>Número</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={correiosSenderNumber}
                    onChange={(e) => setCorreiosSenderNumber(e.target.value)}
                    placeholder="123"
                  />
                </div>
                <div>
                  <label className={labelClass}>Bairro</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={correiosSenderDistrict}
                    onChange={(e) => setCorreiosSenderDistrict(e.target.value)}
                    placeholder="Centro"
                  />
                </div>
                <div>
                  <label className={labelClass}>Complemento</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={correiosSenderComplement}
                    onChange={(e) => setCorreiosSenderComplement(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>CNPJ (opcional)</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={correiosSenderCnpj}
                    onChange={(e) => setCorreiosSenderCnpj(e.target.value.replace(/\D/g, '').slice(0, 14))}
                  />
                </div>
                <div>
                  <label className={labelClass}>Cidade</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={correiosSenderCity}
                    onChange={(e) => setCorreiosSenderCity(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>UF</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={correiosSenderState}
                    onChange={(e) => setCorreiosSenderState(e.target.value.toUpperCase().slice(0, 2))}
                    placeholder="SP"
                  />
                </div>
                <div>
                  <label className={labelClass}>Telefone</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={correiosSenderPhone}
                    onChange={(e) => setCorreiosSenderPhone(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border space-y-4">
              <div>
                <h3 className="font-display text-base tracking-wide text-foreground">Transportadora</h3>
                <p className="font-body text-sm text-muted-foreground mt-1">
                  Frete fixo ou calculado por peso, sem integração com API. Aparece no checkout junto com PAC/SEDEX.
                </p>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={carrierEnabled}
                  onChange={(e) => setCarrierEnabled(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="font-body text-sm text-foreground">Oferecer transportadora no checkout</span>
              </label>

              {carrierEnabled && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Nome exibido ao cliente</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={carrierName}
                      onChange={(e) => setCarrierName(e.target.value)}
                      placeholder="Transportadora"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Valor do frete (R$)</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={carrierPrice}
                      onChange={(e) => setCarrierPrice(e.target.value.replace(/[^\d,.]/g, ''))}
                      placeholder="Ex.: 35,00 (vazio = por peso)"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Prazo (dias úteis)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      className={inputClass}
                      value={carrierDeadlineDays}
                      onChange={(e) => setCarrierDeadlineDays(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-border space-y-4">
              <div>
                <h3 className="font-display text-base tracking-wide text-foreground">Rodonaves (integração API)</h3>
                <p className="font-body text-sm text-muted-foreground mt-1">
                  Cotação de frete em tempo real pela API da Rodonaves (RTE). É preciso ter cadastro
                  como cliente Rodonaves e credenciais de API fornecidas pela transportadora.
                </p>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rodonavesEnabled}
                  onChange={(e) => setRodonavesEnabled(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="font-body text-sm text-foreground">Oferecer Rodonaves no checkout</span>
              </label>

              {rodonavesEnabled && !rodonaves?.is_ready && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="font-body text-xs text-amber-800 dark:text-amber-300">
                    Preencha usuário, senha e CNPJ para a cotação funcionar. Enquanto isso, a opção
                    Rodonaves não aparecerá no checkout.
                  </p>
                </div>
              )}

              {rodonavesEnabled && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Usuário da API *</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={rodonavesUsername}
                      onChange={(e) => setRodonavesUsername(e.target.value)}
                      placeholder="Usuário fornecido pela Rodonaves"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Senha da API *</label>
                    <input
                      type="password"
                      className={inputClass}
                      value={rodonavesPassword}
                      onChange={(e) => setRodonavesPassword(e.target.value)}
                      placeholder={rodonaves?.has_password ? rodonaves.password_masked || 'Senha salva' : 'Senha de acesso'}
                      autoComplete="new-password"
                    />
                    {rodonaves?.has_password && (
                      <p className="font-body text-xs text-muted-foreground mt-1">
                        Já configurada. Preencha apenas para trocar.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>CNPJ do cliente Rodonaves *</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={rodonavesCnpj}
                      onChange={(e) => setRodonavesCnpj(e.target.value.replace(/\D/g, '').slice(0, 14))}
                      placeholder="Somente números"
                      autoComplete="off"
                    />
                    <p className="font-body text-xs text-muted-foreground mt-1">
                      CNPJ vinculado ao contrato/tabela negociada com a Rodonaves.
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Nome exibido ao cliente</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={rodonavesLabel}
                      onChange={(e) => setRodonavesLabel(e.target.value)}
                      placeholder="Rodonaves"
                    />
                  </div>
                </div>
              )}
            </div>

            {correios && (
              <p className="font-body text-xs text-muted-foreground">
                Serviços: {correios.services?.map((s) => s.label).join(', ') || 'PAC, SEDEX'}
                {correios.has_contract ? ' (com contrato)' : ' (varejo)'}
                {correios.has_post_card ? ' · Cartão configurado' : ' · Sem cartão de postagem'}
                {correios.has_api_credentials ? ' · API OK' : ' · API não configurada'}
                {correios.fallback_mode && correios.fallback_mode !== 'off' && (
                  <> · Fallback: <span className="font-mono">{correios.fallback_mode}</span> (env CORREIOS_FALLBACK)</>
                )}
              </p>
            )}

            <div className="p-3 rounded-sm bg-secondary/50 border border-border font-body text-xs text-muted-foreground">
              Se a API legada dos Correios não responder, o sistema usa frete estimado em desenvolvimento
              (<span className="font-mono">CORREIOS_FALLBACK=auto</span>). Em produção, use <span className="font-mono">off</span> ou migre para a API REST com contrato.
            </div>
            </TabsContent>

            <TabsContent value="cielo" className="space-y-6 mt-0 focus-visible:outline-none">
              <div className="flex items-start gap-3">
                <CreditCard className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <h2 className="font-display text-lg tracking-wide text-foreground">Pagamento Cielo</h2>
                  <p className="font-body text-sm text-muted-foreground mt-1">
                    Checkout Cielo — o cliente é redirecionado ao gateway seguro da Cielo para pagar com cartão.
                  </p>
                  <a
                    href={CIELO_DOCS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-body text-xs text-primary hover:underline mt-2"
                  >
                    Documentação oficial
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

            {cielo && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-sm text-sm font-body ${
                cielo.isReady
                  ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
              }`}>
                {cielo.isReady ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {cielo.isReady
                  ? 'API Cielo pronta para checkout'
                  : 'Configure o MerchantId para habilitar pagamentos'}
                {autoTotal > 0 && (
                  <span className="ml-auto text-xs opacity-80">
                    {autoDoneCount}/{autoTotal} requisitos automáticos
                  </span>
                )}
              </div>
            )}

            <div className="p-4 bg-secondary/50 rounded-sm border border-border">
              <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-3">
                Requisitos da API
              </p>
              <ul className="space-y-3">
                {requirements.map((item) => (
                  <RequirementItem key={item.id} item={item} />
                ))}
              </ul>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>
                  <span className="inline-flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5" />
                    MerchantId *
                  </span>
                </label>
                {cielo?.merchantId && (
                  <p className="font-body text-xs text-muted-foreground mb-2">
                    Atual: <span className="font-mono text-foreground">{cielo.merchant_id_masked}</span>
                  </p>
                )}
                <input
                  type="password"
                  className={inputClass}
                  value={cieloMerchantId}
                  onChange={(e) => setCieloMerchantId(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  autoComplete="off"
                />
                <p className="font-body text-xs text-muted-foreground mt-1">
                  GUID de 36 caracteres. Enviado no header <code className="font-mono">MerchantId</code> em cada requisição POST.
                </p>
              </div>

              <div>
                <label className={labelClass}>Soft Descriptor</label>
                <input
                  type="text"
                  className={inputClass}
                  value={cieloSoftDescriptor}
                  onChange={(e) => setCieloSoftDescriptor(e.target.value.slice(0, 13))}
                  placeholder="SORELLE"
                  maxLength={13}
                />
                <p className="font-body text-xs text-muted-foreground mt-1">
                  Nome na fatura do cartão (máx. 13 caracteres).
                </p>
              </div>

              <div>
                <label className={labelClass}>Máx. parcelas</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  className={inputClass}
                  value={cieloMaxInstallments}
                  onChange={(e) => setCieloMaxInstallments(e.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass}>URL do site (retorno)</label>
                <input
                  type="url"
                  className={inputClass}
                  value={cieloFrontendUrl}
                  onChange={(e) => setCieloFrontendUrl(e.target.value)}
                  placeholder="http://localhost:3000"
                />
                <p className="font-body text-xs text-muted-foreground mt-1">
                  <strong>URL de Retorno</strong> (cadastre no painel Cielo):{' '}
                  <span className="font-mono break-all">{cielo?.returnUrlExample || '—'}</span>
                </p>
                <p className="font-body text-xs text-muted-foreground mt-1">
                  O comprador é redirecionado para esta página após o pagamento. Nenhum dado é enviado pela Cielo.
                </p>
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass}>URL pública do backend</label>
                <input
                  type="url"
                  className={inputClass}
                  value={cieloBackendUrl}
                  onChange={(e) => setCieloBackendUrl(e.target.value)}
                  placeholder="http://localhost:3001"
                />
                <p className="font-body text-xs text-muted-foreground mt-1">
                  <strong>URL de Notificação</strong> (transação finalizada):{' '}
                  <span className="font-mono break-all">{cielo?.notificationUrl || '—'}</span>
                </p>
                <p className="font-body text-xs text-muted-foreground mt-1">
                  <strong>URL de Mudança de Status</strong>:{' '}
                  <span className="font-mono break-all">{cielo?.statusChangeUrl || '—'}</span>
                </p>
                <p className="font-body text-xs text-muted-foreground mt-1">
                  Cadastre as duas URLs do backend no painel Cielo (Configurações → Notificação de Pagamentos).
                  Pedidos com status <strong>Autorizado (7)</strong> ou <strong>Pago (2)</strong> são marcados como pagos automaticamente.
                </p>
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass}>URL da API Checkout</label>
                <input
                  type="url"
                  className={inputClass}
                  value={cieloCheckoutApiUrl}
                  onChange={(e) => setCieloCheckoutApiUrl(e.target.value)}
                  placeholder="https://cieloecommerce.cielo.com.br/api/public/v1/orders/"
                />
                <p className="font-body text-xs text-muted-foreground mt-1">
                  Endpoint POST para criar pedidos. Mantenha o padrão salvo, salvo orientação da Cielo.
                </p>
              </div>
            </div>

            <div className="p-4 bg-secondary/30 rounded-sm border border-border font-body text-xs text-muted-foreground space-y-1">
              <p className="text-foreground font-medium text-sm mb-2">Campos enviados no checkout</p>
              <p>• <strong>Cart.Items</strong> — produtos do carrinho (preço em centavos)</p>
              <p>• <strong>Customer</strong> — CPF, nome, e-mail e telefone do comprador</p>
              <p>• <strong>Shipping</strong> — endereço e CEP informados no checkout</p>
              <p>• <strong>Options.ReturnUrl</strong> — redirecionamento após pagamento</p>
              <p>• <strong>Payment.MaxNumberOfInstallments</strong> — parcelas configuradas acima</p>
            </div>
            </TabsContent>

            <TabsContent value="imagens" className="space-y-6 mt-0 focus-visible:outline-none">
              <div className="flex items-start gap-3 p-4 bg-secondary/50 rounded-sm border border-border">
                <Sparkles className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div className="font-body text-sm text-muted-foreground">
                  <p className="text-foreground font-medium mb-1">Geração a partir da foto</p>
                  <p>
                    Ao enviar uma foto no cadastro de produto, o sistema usa img2img gratuito (Stable Horde).
                    Nenhum token é obrigatório, mas a fila anônima pode demorar alguns minutos.
                  </p>
                </div>
              </div>

            <div>
              <label className={labelClass}>
                <span className="inline-flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5" />
                  Token Stable Horde (opcional — fila mais rápida)
                </span>
              </label>
              {data?.has_stable_horde_key && (
                <p className="font-body text-xs text-muted-foreground mb-2">
                  Token atual: <span className="font-mono text-foreground">{data.stable_horde_api_key_masked}</span>
                </p>
              )}
              <input
                type="password"
                className={inputClass}
                value={stableHordeKey}
                onChange={(e) => setStableHordeKey(e.target.value)}
                placeholder="Opcional — stablehorde.net/register"
                autoComplete="off"
              />
            </div>

            <div>
              <label className={labelClass}>
                <span className="inline-flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5" />
                  Token Hugging Face (opcional — melhor fidelidade)
                </span>
              </label>
              {data?.has_huggingface_token && (
                <p className="font-body text-xs text-muted-foreground mb-2">
                  Token atual: <span className="font-mono text-foreground">{data.huggingface_api_token_masked}</span>
                </p>
              )}
              <input
                type="password"
                className={inputClass}
                value={hfToken}
                onChange={(e) => setHfToken(e.target.value)}
                placeholder="Opcional — huggingface.co/settings/tokens"
                autoComplete="off"
              />
            </div>

            <div>
              <label className={labelClass}>
                <span className="inline-flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5" />
                  Token Pollinations (opcional)
                </span>
              </label>
              {data?.has_pollinations_key && (
                <p className="font-body text-xs text-muted-foreground mb-2">
                  Token atual: <span className="font-mono text-foreground">{data.pollinations_api_key_masked}</span>
                </p>
              )}
              <input
                type="password"
                className={inputClass}
                value={pollinationsKey}
                onChange={(e) => setPollinationsKey(e.target.value)}
                placeholder="Opcional — enter.pollinations.ai"
                autoComplete="off"
              />
            </div>

            <div>
              <label className={labelClass}>Modelo Pollinations (fallback)</label>
              <select className={inputClass} value={model} onChange={(e) => setModel(e.target.value)}>
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            </TabsContent>
          </Tabs>

          <div className="mt-8 space-y-4 pt-6 border-t border-border">
          {mutation.isError && (
            <div className="p-3 rounded-sm bg-destructive/10 text-destructive text-sm font-body">
              {mutation.error.message}
            </div>
          )}

          {saved && (
            <div className="flex items-center gap-2 p-3 rounded-sm bg-green-500/10 text-green-700 dark:text-green-400 text-sm font-body">
              <CheckCircle2 className="w-4 h-4" />
              Configurações salvas com sucesso!
            </div>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-sm font-body text-sm tracking-wider hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {mutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
          </button>
          </div>
        </form>
      )}
    </div>
  );
}
