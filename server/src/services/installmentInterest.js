import { getSetting } from './settings.js';

export const MAX_INSTALLMENT_INTEREST_TIERS = 10;

export function normalizeInterestPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, Math.round(n * 100) / 100);
}

export function parseInstallmentInterestRates(raw) {
  const byInstallments = new Map();

  if (typeof raw === 'string' && raw.trim()) {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }

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

export async function getInstallmentInterestRates() {
  const raw = (await getSetting('installment_interest_rates'))
    || process.env.INSTALLMENT_INTEREST_RATES
    || '';

  // Compatibilidade com a taxa única antiga (% a.m.)
  if (!raw) {
    const legacy = (await getSetting('installment_interest_percent'))
      || process.env.INSTALLMENT_INTEREST_PERCENT
      || '';
    const legacyRate = normalizeInterestPercent(legacy);
    if (legacyRate > 0) {
      return Array.from({ length: MAX_INSTALLMENT_INTEREST_TIERS }, (_, i) => ({
        installments: i + 1,
        interest_percent: i === 0 ? 0 : legacyRate,
      }));
    }
  }

  return parseInstallmentInterestRates(raw);
}

export function getInterestPercentForInstallments(rates, installments) {
  const n = Math.round(Number(installments) || 0);
  const tiers = parseInstallmentInterestRates(rates);
  const match = tiers.find((tier) => tier.installments === n);
  return match ? match.interest_percent : 0;
}

export function calcInstallmentAmount(principal, installments, rates = []) {
  const amount = Number(principal) || 0;
  const n = Math.round(Number(installments) || 0);
  if (amount <= 0 || n < 1) return null;
  const interestPercent = getInterestPercentForInstallments(rates, n);
  const total = amount * (1 + interestPercent / 100);
  return Math.round((total / n) * 100) / 100;
}

export function calcInstallmentTotal(principal, installments, rates = []) {
  const installment = calcInstallmentAmount(principal, installments, rates);
  if (installment == null) return null;
  const n = Math.round(Number(installments) || 0);
  return Math.round(installment * n * 100) / 100;
}

export function resolveChargedInstallmentAmount(principal, installments, rates = []) {
  const amount = Number(Number(principal).toFixed(2));
  const n = Math.round(Number(installments) || 0);
  if (!(amount > 0) || n < 2) return amount;
  if (getInterestPercentForInstallments(rates, n) <= 0) return amount;
  return Number((calcInstallmentTotal(amount, n, rates) ?? amount).toFixed(2));
}

/** @deprecated use getInstallmentInterestRates */
export async function getInstallmentInterestPercent() {
  const rates = await getInstallmentInterestRates();
  const withInterest = rates.filter((t) => t.installments >= 2 && t.interest_percent > 0);
  if (withInterest.length === 0) return 0;
  return withInterest[withInterest.length - 1].interest_percent;
}
