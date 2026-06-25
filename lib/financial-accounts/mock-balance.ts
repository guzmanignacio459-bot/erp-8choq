/**
 * M6.4 — Saldo mock determinístico hasta ledger real (M6.5+)
 */

export function mockAccountBalance(accountId: string, ratePercent: number): number {
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    hash = (hash * 31 + accountId.charCodeAt(i)) >>> 0;
  }
  const base = 50_000 + (hash % 450_000);
  const rateBoost = Math.round(base * (ratePercent / 100) * 0.15);
  return base + rateBoost;
}
