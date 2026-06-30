/**
 * M6.6.2.1 — Validación preservación tnPaidAt en live import (read-only)
 *
 *   npm run m6.6.2.1:paid-date-preservation:validate
 */
import {
  mergeRawTnPayloadPaidAt,
  mergeTnPaidAt,
} from "../lib/erp/v2/map-tn-order-record";

type CaseResult = {
  name: string;
  pass: boolean;
  expected: unknown;
  actual: unknown;
};

function iso(d: Date | null): string | null {
  return d?.toISOString() ?? null;
}

function runCases(): CaseResult[] {
  const paidExisting = new Date("2026-06-28T16:09:14.000Z");
  const paidIncoming = new Date("2026-06-28T16:09:14.000Z");

  const results: CaseResult[] = [];

  // Caso 1 — existing paid, incoming null → preserve
  results.push({
    name: "Caso 1: existing tnPaidAt, incoming null",
    pass:
      iso(mergeTnPaidAt(null, paidExisting)) === iso(paidExisting),
    expected: iso(paidExisting),
    actual: iso(mergeTnPaidAt(null, paidExisting)),
  });

  // Caso 2 — existing null, incoming paid → adopt incoming
  results.push({
    name: "Caso 2: existing null, incoming tnPaidAt",
    pass:
      iso(mergeTnPaidAt(paidIncoming, null)) === iso(paidIncoming),
    expected: iso(paidIncoming),
    actual: iso(mergeTnPaidAt(paidIncoming, null)),
  });

  // Caso 3 — both null → null
  results.push({
    name: "Caso 3: existing null, incoming null",
    pass: mergeTnPaidAt(null, null) === null,
    expected: null,
    actual: mergeTnPaidAt(null, null),
  });

  // Caso 4 — raw payload paid_at preservation
  const existingRaw = { paid_at: "2026-06-28T16:09:14+0000", payment_status: "paid" };
  const incomingRaw = { paid_at: null, payment_status: "paid", updated_at: "2026-06-29T14:15:34+0000" };
  const mergedRaw = mergeRawTnPayloadPaidAt(incomingRaw, existingRaw);
  results.push({
    name: "Caso 4: raw.paid_at preservation on update",
    pass: mergedRaw.paid_at === "2026-06-28T16:09:14+0000",
    expected: "2026-06-28T16:09:14+0000",
    actual: mergedRaw.paid_at ?? null,
  });

  // Caso 5 — incoming raw with paid_at updates normally
  const incomingWithPaid = {
    paid_at: "2026-06-29T10:00:00+0000",
    payment_status: "paid",
  };
  const mergedNewPaid = mergeRawTnPayloadPaidAt(incomingWithPaid, existingRaw);
  results.push({
    name: "Caso 5: incoming raw paid_at wins over existing",
    pass: mergedNewPaid.paid_at === "2026-06-29T10:00:00+0000",
    expected: "2026-06-29T10:00:00+0000",
    actual: mergedNewPaid.paid_at ?? null,
  });

  return results;
}

async function main() {
  const cases = runCases();
  const pass = cases.every((c) => c.pass);

  const report = {
    generatedAt: new Date().toISOString(),
    module: "M6.6.2.1 paid-date-preservation",
    cases,
    pass,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
