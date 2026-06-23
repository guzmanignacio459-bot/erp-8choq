#!/usr/bin/env node
/**
 * ERP 8Q — Auditoría read-only universo MP Mayo (pre-piloto).
 * Solo GET /api/erp/remitos — no ejecuta import-payment ni mp/apply.
 *
 * Uso: node scripts/audit-mp-mayo-universe.mjs
 */

const PROD =
  process.env.PROD_URL ??
  "https://nextjs-boilerplate-topaz-iota-40.vercel.app";

const MAYO_FROM = "2026-05-01";
const MAYO_TO = "2026-05-31";

function artRangeBoundsMs(fromYmd, toYmd) {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  return {
    startMs: Date.UTC(fy, fm - 1, fd, 3, 0, 0, 0),
    endMs: Date.UTC(ty, tm - 1, td + 1, 2, 59, 59, 999),
  };
}

function artDayKey(iso) {
  const ms = Date.parse(String(iso ?? ""));
  if (Number.isNaN(ms)) return null;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(ms));
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : null;
}

function hasMpApplied(r) {
  return Boolean(
    String(r.mpPaymentId ?? "").trim() ||
      String(r.mpStatus ?? "").trim() ||
      String(r.mpNetoRealOrden ?? "").trim() ||
      String(r.mpTotalCostReal ?? "").trim()
  );
}

function isMpPaymentMethod(metodo) {
  const m = String(metodo ?? "").toLowerCase();
  return m.includes("mercado") || m.includes("mp") || m.includes("cuotas");
}

async function main() {
  console.log("MP Mayo universe audit (read-only)");
  console.log("PROD:", PROD);

  const res = await fetch(`${PROD}/api/erp/remitos`, { cache: "no-store" });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "remitos fail");

  const bounds = artRangeBoundsMs(MAYO_FROM, MAYO_TO);
  const mayo = (json.data ?? []).filter((r) => {
    const ms = Date.parse(String(r.fechaRaw || r.fechaDisplay || ""));
    return (
      !Number.isNaN(ms) && ms >= bounds.startMs && ms <= bounds.endMs
    );
  });

  const byDay = new Map();
  let mpApplied = 0;
  let mpPendingEligible = 0;
  let mpPendingNoTn = 0;
  let nonMpMethod = 0;
  const testsApplied = [];

  for (const r of mayo) {
    const day = artDayKey(r.fechaRaw || r.fechaDisplay) ?? "unknown";
    if (!byDay.has(day)) {
      byDay.set(day, {
        day,
        remitos: 0,
        mpApplied: 0,
        mpPending: 0,
        withTn: 0,
      });
    }
    const row = byDay.get(day);
    row.remitos++;

    const tn = String(r.tnOrderId ?? "").trim();
    if (tn) row.withTn++;

    if (hasMpApplied(r)) {
      mpApplied++;
      row.mpApplied++;
      if (mpApplied <= 5) {
        testsApplied.push({
          idRemito: r.idRemito,
          tnOrderId: tn,
          mpPaymentId: r.mpPaymentId,
          day,
        });
      }
    } else if (isMpPaymentMethod(r.metodoDePago)) {
      mpPendingEligible++;
      row.mpPending++;
      if (!tn) mpPendingNoTn++;
    } else {
      nonMpMethod++;
    }
  }

  const days = [...byDay.values()].sort((a, b) =>
    a.day.localeCompare(b.day)
  );

  const pilotCandidates = days
    .filter((d) => d.mpPending >= 3 && d.mpPending <= 25 && d.day !== "unknown")
    .sort((a, b) => a.mpPending - b.mpPending);

  console.log("\n--- Totales Mayo ART ---");
  console.table({
    remitosMayo: mayo.length,
    mpApplied,
    mpPendingEligible,
    mpPendingSinTn: mpPendingNoTn,
    otrosMetodosPago: nonMpMethod,
    esperadoRemitos: 475,
    abrilReferenciaMp: 270,
  });

  console.log("\n--- MP ya aplicado (muestra) ---");
  console.table(testsApplied);

  console.log("\n--- Top 10 días por volumen remitos ---");
  console.table(
    [...days].sort((a, b) => b.remitos - a.remitos).slice(0, 10)
  );

  console.log("\n--- Candidatos día piloto (3–25 MP pendientes) ---");
  console.table(pilotCandidates.slice(0, 15));

  const suggested = pilotCandidates.find((d) => d.mpPending >= 8) ?? pilotCandidates[0];
  if (suggested) {
    console.log("\nSugerencia piloto (preliminar):", suggested.day, suggested);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
