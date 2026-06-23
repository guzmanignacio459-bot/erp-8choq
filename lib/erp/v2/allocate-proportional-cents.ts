/**
 * Prorrateo proporcional en centavos — paridad GAS allocateProportionalCents_ (M4.2)
 */

export function toCents(amount: number): number {
  return Math.round((Number(amount) || 0) * 100);
}

export function fromCents(cents: number): number {
  return Number(cents || 0) / 100;
}

/**
 * Distribuye poolAmount entre weights usando floor + remainder por fracción decimal.
 * Retorna array de centavos (uno por weight).
 */
export function allocateProportionalCents(
  poolAmount: number,
  weights: number[]
): number[] {
  const pool = toCents(poolAmount);
  const ws = weights.map((w) => Math.max(0, Number(w) || 0));
  const sumW = ws.reduce((a, b) => a + b, 0);

  if (!pool || sumW <= 0) {
    return new Array(ws.length).fill(0);
  }

  const allZero = ws.every((w) => w === 0);
  const eff = allZero ? ws.map(() => 1) : ws;
  const effSum = eff.reduce((a, b) => a + b, 0);

  const ideals = eff.map((w) => (pool * w) / effSum);
  const floors = ideals.map((x) => (x >= 0 ? Math.floor(x) : Math.ceil(x)));
  let used = floors.reduce((a, b) => a + b, 0);
  let rem = pool - used;

  const frac = ideals.map((x, i) => ({ i, frac: x - floors[i] }));

  if (rem > 0) {
    frac.sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < rem; k++) {
      floors[frac[k % frac.length]!.i]! += 1;
    }
  } else if (rem < 0) {
    frac.sort((a, b) => a.frac - b.frac);
    for (let k = 0; k < Math.abs(rem); k++) {
      floors[frac[k % frac.length]!.i]! -= 1;
    }
  }

  return floors;
}

export function allocateProportionalAmounts(
  poolAmount: number,
  weights: number[]
): number[] {
  return allocateProportionalCents(poolAmount, weights).map(fromCents);
}
