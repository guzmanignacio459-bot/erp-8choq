/**
 * M3.1b-3 — validación deltas pre/post refresh
 */

const FEE_TOL = 0.01;
const TAX_TOL = 0.01;
const NETO_PCT_FAIL = 0.05;

export function validateBatchDeltas(preRows, postRows, syncResults) {
  const preByTn = new Map(preRows.map((r) => [r.tnOrderId, r]));
  const postByTn = new Map(postRows.map((r) => [r.tnOrderId, r]));

  const syncFailed = syncResults.filter((r) => !r.ok);
  const details = [];
  let feeFail = 0;
  let taxFail = 0;
  let netoWarn = 0;
  let netoFail = 0;
  let financingEnriched = 0;

  for (const r of syncResults.filter((x) => x.ok && x.action !== "skipped")) {
    const pre = preByTn.get(r.tnOrderId);
    const post = postByTn.get(r.tnOrderId);
    if (!pre || !post) continue;

    const feeDelta = Math.abs((pre.mpFeeTotalReal ?? 0) - (post.mpFeeTotalReal ?? 0));
    const taxPre = pre.mpTaxTotalReal;
    const taxPost = post.mpTaxTotalReal ?? 0;
    const taxDelta =
      taxPre == null ? 0 : Math.abs(Number(taxPre) - Number(taxPost));
    const netoDelta = Math.abs(
      (pre.mpNetoRealOrden ?? 0) - (post.mpNetoRealOrden ?? 0)
    );
    const txn = pre.mpTransactionAmount ?? post.mpTransactionAmount ?? 0;
    const netoPct = txn > 0 ? netoDelta / txn : 0;
    const finPre = pre.mpFinancingTotalReal;
    const finPost = post.mpFinancingTotalReal ?? 0;

    const feeOk = feeDelta <= FEE_TOL;
    const taxOk = taxPre == null ? true : taxDelta <= TAX_TOL;
    const netoOk = netoPct <= NETO_PCT_FAIL;

    if (!feeOk) feeFail++;
    if (!taxOk) taxFail++;
    if (netoDelta > FEE_TOL) netoWarn++;
    if (!netoOk) netoFail++;
    if ((finPre == null || finPre === 0) && finPost > 0) financingEnriched++;

    details.push({
      tnOrderId: r.tnOrderId,
      feeOk,
      feeDelta,
      taxOk,
      taxDelta,
      netoDelta,
      netoPct: Number((netoPct * 100).toFixed(4)),
      netoOk,
      financingEnriched: (finPre == null || finPre === 0) && finPost > 0,
      preNeto: pre.mpNetoRealOrden,
      postNeto: post.mpNetoRealOrden,
      postFinancing: finPost,
    });
  }

  // Neto delta vs GAS es esperado (ADR M3.1b-3) — no bloquea PASS
  const pass = syncFailed.length === 0 && feeFail === 0 && taxFail === 0;

  return {
    pass,
    syncFailed: syncFailed.length,
    synced: syncResults.filter((r) => r.ok && r.action === "updated").length,
    skipped: syncResults.filter((r) => r.ok && r.action === "skipped").length,
    feeFail,
    taxFail,
    netoWarn,
    netoFail,
    financingEnriched,
    maxNetoDelta: Math.max(0, ...details.map((d) => d.netoDelta)),
    avgNetoDelta:
      details.length > 0
        ? details.reduce((a, d) => a + d.netoDelta, 0) / details.length
        : 0,
    details,
    failures: syncFailed,
  };
}
