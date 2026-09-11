import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Loader2 } from 'lucide-react';
import {
  createMercadoPagoInstance,
  getMercadoPagoDeviceId,
} from '@/lib/mercadoPagoSdk';

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatCardNumber(value) {
  return onlyDigits(value).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function formatExpiry(value) {
  const digits = onlyDigits(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function parseExpiry(value) {
  const digits = onlyDigits(value);
  if (digits.length < 4) return null;
  const month = digits.slice(0, 2);
  const year = digits.slice(2, 4);
  const monthNum = Number(month);
  if (monthNum < 1 || monthNum > 12) return null;
  return {
    month,
    year: String(2000 + Number(year)),
  };
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2).replace('.', ',');
}

const MercadoPagoCardForm = forwardRef(function MercadoPagoCardForm({
  publicKey,
  amount,
  document,
  paymentType = 'credit',
  maxInstallments = 12,
  inputClass,
  labelClass,
}, ref) {
  const mpRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [installments, setInstallments] = useState(1);
  const [installmentOptions, setInstallmentOptions] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [binError, setBinError] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const lastBin = useRef('');

  const expectedType = paymentType === 'debit' ? 'debit_card' : 'credit_card';
  const isCredit = paymentType !== 'debit';

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setLoadError('');

    if (!publicKey) {
      setLoadError('Configure a Public Key do Mercado Pago no admin para pagar com cartão.');
      return undefined;
    }

    createMercadoPagoInstance(publicKey)
      .then((mp) => {
        if (cancelled) return;
        mpRef.current = mp;
        setReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err.message || 'Não foi possível iniciar o pagamento com cartão.');
      });

    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const bin = onlyDigits(cardNumber).slice(0, 6);

  useEffect(() => {
    if (!ready || !mpRef.current || bin.length < 6) {
      setPaymentMethod(null);
      setInstallmentOptions([]);
      lastBin.current = '';
      return undefined;
    }
    if (lastBin.current === bin) return undefined;
    lastBin.current = bin;

    let cancelled = false;
    setLookupLoading(true);
    setBinError('');

    (async () => {
      try {
        const methods = await mpRef.current.getPaymentMethods({ bin });
        const method = methods?.results?.[0] || null;
        if (cancelled) return;

        if (!method?.id) {
          setPaymentMethod(null);
          setBinError('Não identificamos a bandeira deste cartão.');
          setInstallmentOptions([]);
          return;
        }

        const typeId = String(method.payment_type_id || '');
        if (typeId && typeId !== expectedType && typeId !== 'prepaid_card') {
          setPaymentMethod(null);
          setInstallmentOptions([]);
          setBinError(
            expectedType === 'debit_card'
              ? 'Este cartão parece ser de crédito. Selecione crédito ou use outro cartão.'
              : 'Este cartão parece ser de débito. Selecione débito ou use outro cartão.'
          );
          return;
        }

        setPaymentMethod(method);

        if (!isCredit) {
          setInstallmentOptions([]);
          setInstallments(1);
          return;
        }

        const result = await mpRef.current.getInstallments({
          amount: String(Number(amount || 0).toFixed(2)),
          bin,
          paymentTypeId: 'credit_card',
        });
        if (cancelled) return;

        const payerCosts = result?.[0]?.payer_costs || [];
        const ceiling = Math.min(12, Math.max(1, Number(maxInstallments) || 12));
        const options = payerCosts
          .filter((option) => Number(option.installments) >= 1 && Number(option.installments) <= ceiling)
          .map((option) => ({
            installments: Number(option.installments),
            recommended_message: option.recommended_message
              || `${option.installments}x de R$ ${formatMoney(option.installment_amount)}`,
            issuer_id: result?.[0]?.issuer?.id,
          }));

        setInstallmentOptions(options);
        setInstallments((current) => (
          options.some((option) => option.installments === current)
            ? current
            : (options[0]?.installments || 1)
        ));
      } catch {
        if (!cancelled) {
          setPaymentMethod(null);
          setInstallmentOptions([]);
          setBinError('Não foi possível identificar o cartão. Confira o número.');
        }
      } finally {
        if (!cancelled) setLookupLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [amount, bin, expectedType, isCredit, maxInstallments, ready]);

  const issuerId = useMemo(
    () => installmentOptions.find((option) => option.installments === installments)?.issuer_id
      || paymentMethod?.issuer?.id
      || paymentMethod?.issuer_id
      || null,
    [installmentOptions, installments, paymentMethod]
  );

  useImperativeHandle(ref, () => ({
    async tokenize() {
      if (!publicKey) {
        throw new Error('Configure a Public Key do Mercado Pago no admin para pagar com cartão.');
      }
      if (!ready || !mpRef.current) {
        throw new Error('Pagamento com cartão ainda está carregando. Aguarde um instante.');
      }

      const number = onlyDigits(cardNumber);
      const parsedExpiry = parseExpiry(expiry);
      const holder = holderName.trim();
      const cvvDigits = onlyDigits(cvv);
      const identification = onlyDigits(document);

      if (number.length < 13) throw new Error('Informe o número do cartão');
      if (!holder) throw new Error('Informe o nome impresso no cartão');
      if (!parsedExpiry) throw new Error('Informe a validade no formato MM/AA');
      if (cvvDigits.length < 3) throw new Error('Informe o código de segurança (CVV)');
      if (identification.length !== 11 && identification.length !== 14) {
        throw new Error('Informe um CPF válido para pagar com cartão');
      }
      if (binError) throw new Error(binError);
      if (!paymentMethod?.id) {
        throw new Error('Não identificamos a bandeira do cartão. Confira o número.');
      }

      let token;
      try {
        token = await mpRef.current.createCardToken({
          cardNumber: number,
          cardholderName: holder,
          cardExpirationMonth: parsedExpiry.month,
          cardExpirationYear: parsedExpiry.year,
          securityCode: cvvDigits,
          identificationType: identification.length === 11 ? 'CPF' : 'CNPJ',
          identificationNumber: identification,
        });
      } catch (err) {
        throw new Error(
          err?.message
          || err?.cause?.[0]?.description
          || 'Não foi possível validar o cartão. Confira os dados.'
        );
      }

      const tokenId = token?.id || token?.token;
      if (!tokenId) {
        const cause = token?.cause?.[0]?.description || token?.message;
        throw new Error(cause || 'Não foi possível validar o cartão. Confira os dados.');
      }

      return {
        token: tokenId,
        payment_method_id: paymentMethod.id,
        issuer_id: issuerId,
        installments: isCredit ? installments : 1,
        device_id: getMercadoPagoDeviceId(),
      };
    },
  }), [binError, cardNumber, cvv, document, expiry, holderName, installments, isCredit, issuerId, paymentMethod, publicKey, ready]);

  if (loadError) {
    return (
      <div className="p-3 rounded-sm bg-destructive/10 text-destructive text-sm font-body">
        {loadError}
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground font-body py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando pagamento seguro...
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 border border-border rounded-sm bg-secondary/20">
      <p className="font-body text-xs text-muted-foreground tracking-wider uppercase">
        {isCredit ? 'Cartão de crédito' : 'Cartão de débito'}
      </p>
      <div>
        <label className={labelClass}>Número do cartão *</label>
        <input
          className={inputClass}
          value={cardNumber}
          onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
          placeholder="ACCT-000003"
          inputMode="numeric"
          autoComplete="cc-number"
        />
        {lookupLoading && (
          <p className="mt-1 text-xs text-muted-foreground font-body">Identificando bandeira...</p>
        )}
        {!lookupLoading && paymentMethod?.name && (
          <p className="mt-1 text-xs text-muted-foreground font-body">{paymentMethod.name}</p>
        )}
        {binError && (
          <p className="mt-1 text-xs text-destructive font-body">{binError}</p>
        )}
      </div>
      <div>
        <label className={labelClass}>Nome impresso no cartão *</label>
        <input
          className={inputClass}
          value={holderName}
          onChange={(e) => setHolderName(e.target.value)}
          placeholder="Como está no cartão"
          autoComplete="cc-name"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Validade *</label>
          <input
            className={inputClass}
            value={expiry}
            onChange={(e) => setExpiry(formatExpiry(e.target.value))}
            placeholder="MM/AA"
            inputMode="numeric"
            autoComplete="cc-exp"
          />
        </div>
        <div>
          <label className={labelClass}>CVV *</label>
          <input
            className={inputClass}
            value={cvv}
            onChange={(e) => setCvv(onlyDigits(e.target.value).slice(0, 4))}
            placeholder="000"
            inputMode="numeric"
            autoComplete="cc-csc"
          />
        </div>
      </div>
      {isCredit && installmentOptions.length > 0 && (
        <div>
          <label className={labelClass}>Parcelas *</label>
          <select
            className={inputClass}
            value={installments}
            onChange={(e) => setInstallments(Number(e.target.value))}
          >
            {installmentOptions.map((option) => (
              <option key={option.installments} value={option.installments}>
                {option.recommended_message}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="font-body text-xs text-muted-foreground">
        Os dados do cartão são criptografados pelo Mercado Pago e não passam pelo servidor da loja.
      </p>
    </div>
  );
});

export default MercadoPagoCardForm;
