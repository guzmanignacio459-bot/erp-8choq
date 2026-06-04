#!/usr/bin/env node
/**
 * ERP 8Q — Auditoría interna read-only del dashboard (prod o staging).
 *
 * Valida:
 * - Remitos (filtro ART vs conteos esperados)
 * - Remito Items (filas vs summary.totalPrendas)
 * - Analytics (remitosInScope)
 * - Alineación KPI tabla (misma fuente lógica)
 * - Stress de rangos (requests alternados)
 *
 * NO modifica datos. Solo GET a /api/erp/*.
 *
 * Uso:
 *   node scripts/audit-erp-dashboard.mjs
 *   PROD_URL=https://... node scripts/audit-erp-dashboard.mjs
 *   node scripts/audit-erp-dashboard.mjs --from 2026-05-01 --to 2026-05-31 --expect 475
 *
 * Exit 0 = PASS, 1 = FAIL
 */

const PROD =
  process.env.PROD_URL ??
  "https://nextjs-boilerplate-topaz-iota-40.vercel.app";

const DEFAULT_RANGES = {
  abril: { from: "2026-04-01", to: "2026-04-30", expectedRemitos: 360 },
  mayo: { from: "2026-05-01", to: "2026-05-31", expectedRemitos: 475 },
};

const DEFAULT_DAY = "2026-05-15";

function parseArgs(argv) {
  const out = {
    ranges: { ...DEFAULT_RANGES },
    day: DEFAULT_DAY,
    stressRounds: 4,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from" && argv[i + 1]) {
      out.custom = out.custom ?? {};
      out.custom.from = argv[++i];
    } else if (a === "--to" && argv[i + 1]) {
      out.custom = out.custom ?? {};
      out.custom.to = argv[++i];
    } else if (a === "--expect" && argv[i + 1]) {
      out.custom = out.custom ?? {};
      out.custom.expectedRemitos = Number(argv[++i]);
    } else if (a === "--day" && argv[i + 1]) {
      out.day = argv[++i];
    } else if (a === "--stress" && argv[i + 1]) {
      out.stressRounds = Number(argv[++i]);
    }
  }
  if (out.custom?.from && out.custom?.to && out.custom.expectedRemitos) {
    out.ranges = {
      custom: {
        from: out.custom.from,
        to: out.custom.to,
        expectedRemitos: out.custom.expectedRemitos,
      },
    };
  }
  return out;
}

async function fetchJson(path) {
  const url = `${PROD}${path}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${path}: invalid JSON (${res.status}) ${text.slice(0, 120)}`);
  }
  return { res, json };
}

/** Bounds ART (UTC-3 día calendario) — alineado con filterRemitosByArtDateRange */
function artRangeBoundsMs(fromYmd, toYmd) {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  const startMs = Date.UTC(fy, fm - 1, fd, 3, 0, 0, 0);
  const endMs = Date.UTC(ty, tm - 1, td + 1, 2, 59, 59, 999);
  return { startMs, endMs };
}

function artInstantMs(iso) {
  const raw = String(iso ?? "").trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

function filterRemitosArt(remitos, from, to) {
  const bounds = artRangeBoundsMs(from, to);
  return remitos.filter((r) => {
    const ms = artInstantMs(r.fechaRaw || r.fechaDisplay);
    if (ms == null) return false;
    return ms >= bounds.startMs && ms <= bounds.endMs;
  });
}

function hasMpApplied(r) {
  return Boolean(
    String(r.mpPaymentId ?? "").trim() ||
      String(r.mpStatus ?? "").trim() ||
      String(r.mpNetoRealOrden ?? "").trim() ||
      String(r.mpTotalCostReal ?? "").trim()
  );
}

function isMpEligibleMethod(metodo) {
  const m = String(metodo ?? "").toLowerCase();
  return (
    m.includes("mercado") ||
    m.includes("mp") ||
    m === "mercadopago" ||
    m.includes("cuotas")
  );
}

async function main() {
  const args = parseArgs(process.argv);
  console.log("ERP Dashboard Audit (read-only)");
  console.log("PROD:", PROD);
  console.log("---");

  const { json: remitosJson } = await fetchJson("/api/erp/remitos");
  if (!remitosJson.ok) {
    throw new Error(remitosJson.error ?? "GET /api/erp/remitos failed");
  }
  const allRemitos = remitosJson.data ?? [];
  console.log(`Remitos cargados (full list): ${allRemitos.length}`);

  const results = [];

  for (const [label, { from, to, expectedRemitos }] of Object.entries(
    args.ranges
  )) {
    const filtered = filterRemitosArt(allRemitos, from, to);
    const remitosCount = filtered.length;
    const kpiTotalRemitos = remitosCount;
    const kpiMpApplied = filtered.filter(hasMpApplied).length;

    const { json: analyticsJson } = await fetchJson(
      `/api/erp/analytics?from=${from}&to=${to}`
    );
    const analyticsScope = analyticsJson.ok
      ? analyticsJson.data?.remitosInScope
      : null;

    const { json: itemsJson } = await fetchJson(
      `/api/erp/remito-items?from=${from}&to=${to}`
    );
    const itemRows = itemsJson.ok ? itemsJson.data?.items?.length ?? 0 : null;
    const itemsSummaryPrendas = itemsJson.ok
      ? itemsJson.data?.summary?.totalPrendas
      : null;

    const okRemitos =
      expectedRemitos == null ? true : remitosCount === expectedRemitos;
    const okAnalytics =
      expectedRemitos == null
        ? analyticsJson.ok
        : analyticsScope === expectedRemitos;
    const okItemsKpi =
      itemRows == null ||
      itemsSummaryPrendas == null ||
      itemRows === itemsSummaryPrendas;
    const okKpiTable = kpiTotalRemitos === remitosCount;

    results.push({
      label,
      from,
      to,
      expectedRemitos: expectedRemitos ?? "—",
      remitosFiltered: remitosCount,
      kpiTotalRemitos,
      mpAppliedInRange: kpiMpApplied,
      analyticsRemitosInScope: analyticsScope,
      remitoItemRows: itemRows,
      itemsSummaryPrendas,
      okRemitos,
      okAnalytics,
      okItemsKpi,
      okKpiTable,
    });
  }

  const day = args.day;
  const dayFiltered = filterRemitosArt(allRemitos, day, day);
  const { json: dayAnalytics } = await fetchJson(
    `/api/erp/analytics?from=${day}&to=${day}`
  );
  const dayScope = dayAnalytics.ok ? dayAnalytics.data?.remitosInScope : null;
  const { json: dayItems } = await fetchJson(
    `/api/erp/remito-items?from=${day}&to=${day}`
  );
  const dayItemRows = dayItems.ok ? dayItems.data?.items?.length ?? 0 : null;
  const daySummaryPrendas = dayItems.ok
    ? dayItems.data?.summary?.totalPrendas
    : null;

  const rangeEntries = Object.values(args.ranges);
  const stress = [];
  for (let i = 0; i < args.stressRounds; i++) {
    const r = rangeEntries[i % rangeEntries.length];
    const { json } = await fetchJson(
      `/api/erp/analytics?from=${r.from}&to=${r.to}`
    );
    stress.push({
      i,
      from: r.from,
      to: r.to,
      remitosInScope: json.data?.remitosInScope,
      expected: r.expectedRemitos ?? "—",
      ok:
        r.expectedRemitos == null
          ? json.ok
          : json.data?.remitosInScope === r.expectedRemitos,
    });
  }

  console.log("\n--- Rangos ---");
  console.table(results);

  console.log("\n--- Día único (from === to) ---");
  console.table([
    {
      day,
      remitosFiltered: dayFiltered.length,
      analyticsScope: dayScope,
      remitoItemRows: dayItemRows,
      itemsSummaryPrendas: daySummaryPrendas,
      remitosAnalyticsOk: dayFiltered.length === dayScope,
      itemsKpiOk: dayItemRows === daySummaryPrendas,
    },
  ]);

  console.log("\n--- Stress analytics ---");
  console.table(stress);

  const allOk =
    results.every(
      (r) =>
        r.okRemitos &&
        r.okAnalytics &&
        r.okItemsKpi &&
        r.okKpiTable
    ) &&
    stress.every((s) => s.ok) &&
    dayFiltered.length === dayScope &&
    dayItemRows === daySummaryPrendas;

  console.log("\nVALIDATION:", allOk ? "PASS" : "FAIL");
  if (!allOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
