/** Taxas de juros por quantidade de parcelas (1x–10x). */
export const MAX_INSTALLMENT_INTEREST_TIERS = 10;

export const DEFAULT_INSTALLMENT_INTEREST_RATES = Array.from(
  { length: MAX_INSTALLMENT_INTEREST_TIERS },
  (_, i) => ({ installments: i + 1, interest_percent: 0 })
);

export function normalizeInterestPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, Math.round(n * 100) / 100);
}

export function normalizeInstallmentInterestRates(raw) {
  const byInstallments = new Map();

  if (Array.isArray(raw)) {
    for (const tier of raw) {
      const installments = Math.round(Number(tier?.installments) || 0);
      if (installments < 1 || installments > MAX_INSTALLMENT_INTEREST_TIERS) continue;
      byInstallments.set(installments, normalizeInterestPercent(tier?.interest_percent));
    }
  } else if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      const installments = Math.round(Number(key) || 0);
      if (installments < 1 || installments > MAX_INSTALLMENT_INTEREST_TIERS) continue;
      byInstallments.set(installments, normalizeInterestPercent(value));
    }
  }

  return Array.from({ length: MAX_INSTALLMENT_INTEREST_TIERS }, (_, i) => {
    const installments = i + 1;
    return {
      installments,
      interest_percent: byInstallments.has(installments)
        ? byInstallments.get(installments)
        : 0,
    };
  });
}

export function getInterestPercentForInstallments(rates, installments) {
  const n = Math.round(Number(installments) || 0);
  const tiers = normalizeInstallmentInterestRates(rates);
  const match = tiers.find((tier) => tier.installments === n);
  return match ? match.interest_percent : 0;
}

/** Acréscimo percentual sobre o valor total daquela opção de parcela. */
export function calcInstallmentAmount(principal, installments, interestPercentOrRates = 0) {
  const amount = Number(principal) || 0;
  const n = Math.round(Number(installments) || 0);
  if (amount <= 0 || n < 1) return null;

  const interestPercent = Array.isArray(interestPercentOrRates) || (
    interestPercentOrRates && typeof interestPercentOrRates === 'object'
  )
    ? getInterestPercentForInstallments(interestPercentOrRates, n)
    : normalizeInterestPercent(interestPercentOrRates);

  const total = amount * (1 + interestPercent / 100);
  return Math.round((total / n) * 100) / 100;
}

export function calcInstallmentTotal(principal, installments, interestPercentOrRates = 0) {
  const installment = calcInstallmentAmount(principal, installments, interestPercentOrRates);
  if (installment == null) return null;
  const n = Math.round(Number(installments) || 0);
  return Math.round(installment * n * 100) / 100;
}
