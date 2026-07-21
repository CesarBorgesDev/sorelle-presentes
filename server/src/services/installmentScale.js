import { getSetting } from './settings.js';

/** Escala padrão: acima de 600 → 10x; abaixo → 5x. */
export const DEFAULT_INSTALLMENT_SCALE = [
  { min_amount: 600, installments: 10 },
  { min_amount: 0, installments: 5 },
];

function clampInstallments(value) {
  const n = Math.round(Number(value) || 0);
  return Math.min(12, Math.max(1, n));
}

function normalizeTier(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_INSTALLMENT_SCALE.map((tier) => ({ ...tier }));
  }

  const tiers = raw
    .map((tier) => ({
      min_amount: Math.max(0, Number(tier?.min_amount) || 0),
      installments: clampInstallments(tier?.installments),
    }))
    .sort((a, b) => b.min_amount - a.min_amount);

  // Garante um piso em 0
  if (!tiers.some((tier) => tier.min_amount === 0)) {
    tiers.push({ min_amount: 0, installments: tiers[tiers.length - 1]?.installments || 5 });
  }

  return tiers;
}

export function parseInstallmentScale(raw) {
  if (!raw) return DEFAULT_INSTALLMENT_SCALE.map((tier) => ({ ...tier }));

  if (typeof raw === 'string') {
    try {
      return normalizeTier(JSON.parse(raw));
    } catch {
      return DEFAULT_INSTALLMENT_SCALE.map((tier) => ({ ...tier }));
    }
  }

  return normalizeTier(raw);
}

export async function getInstallmentScale() {
  const raw = (await getSetting('installment_scale')) || process.env.INSTALLMENT_SCALE || '';
  return parseInstallmentScale(raw);
}

/**
 * Resolve o máximo de parcelas para um valor.
 * @param {number} amount
 * @param {Array<{min_amount:number, installments:number}>} scale
 * @param {number} [absoluteMax=12] teto do gateway
 */
export function resolveMaxInstallments(amount, scale, absoluteMax = 12) {
  const value = Number(amount) || 0;
  const tiers = normalizeTier(scale);
  const ceiling = clampInstallments(absoluteMax);

  const match = tiers.find((tier) => value >= tier.min_amount)
    || tiers[tiers.length - 1]
    || { installments: 1 };

  return Math.min(ceiling, clampInstallments(match.installments));
}
