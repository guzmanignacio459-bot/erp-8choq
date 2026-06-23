#!/usr/bin/env node
/**
 * Valida KPIs monetarios REMITO_ITEMS vs Σ Total Final REMITOS (read-only prod).
 * Exit 0 = PASS dentro de tolerancia documentada.
 */
const PROD =
  process.env.PROD_URL ??
  "https://nextjs-boilerplate-topaz-iota-40.vercel.app";

const RANGES = {
  mayo: { from: "2026-05-01", to: "2026-05-31", expectedRemitos: 475 },
  abril: { from: "2026-04-01", to: "2026-04-30", expectedRemitos: 360 },
};

function artRangeBoundsMs(fromYmd, toYmd) {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  return {
    startMs: Date.UTC(fy, fm - 1, fd, 3, 0, 0, 0),
    endMs: Date.UTC(ty, tm - 1, td + 1, 2, 59, 59, 999),
  };
}

function filterRemitosArt(remitos, from, to) {
  const bounds = artRangeBoundsMs(from, to);
  return remitos.filter((r) => {
    const ms = Date.parse(String(r.fechaRaw || r.fechaDisplay || "").trim());
    if (Number.isNaN(ms)) return false;
    return ms >= bounds.startMs && ms <= bounds.endMs;
  });
}

function parseAmount(v) {
  const trimmed = String(v ?? "").trim();
  if (!trimmed) return 0;
  if (trimmed.includes(",")) {
    return (
      parseFloat(trimmed.replace(/\./g, "").replace(",", ".")) || 0
    );
  }
  return parseFloat(trimmed.replace(/[^\d.-]/g, "")) || 0;
}

function units(row) {
  return row.cantidad > 0 ? row.cantidad : 1;
}

function sumKpis(items) {
  let bruto = 0;
  let netoPrenda = 0;
  let netoDisplay = 0;
  let desc = 0;
  for (const row of items) {
    const u = units(row);
    bruto += row.precioUnitario * u;
    netoPrenda += row.netoPrenda * u;
    netoDisplay += row.netoDisplay * u;
    desc += row.descuentoAsignado * u;
  }
  return { bruto, netoPrenda, netoDisplay, desc, rows: items.length };
}

async function main() {
  const remitos = await fetch(`${PROD}/api/erp/remitos`, {
    cache: "no-store",
  })
    .then((r) => r.json())
    .then((j) => j.data ?? []);

  const rows = [];
  for (const [label, range] of Object.entries(RANGES)) {
    const items = (
      await fetch(
        `${PROD}/api/erp/remito-items?from=${range.from}&to=${range.to}`,
        { cache: "no-store" }
      )
    )
      .json()
      .then((j) => j.data?.items ?? []);

    const [itemList, remitoList] = await Promise.all([items, remitos]);
    const rem = filterRemitosArt(remitoList, range.from, range.to);
    const sumTf = rem.reduce((a, r) => a + parseAmount(r.totalFinal), 0);
    const kpi = sumKpis(itemList);
    const pct =
      sumTf > 0
        ? Math.abs(kpi.netoPrenda - sumTf) / sumTf
        : 0;
    const okRemitos = rem.length === range.expectedRemitos;
    const okNeto = pct < 0.02;
    rows.push({
      label,
      remitos: rem.length,
      items: kpi.rows,
      sumTotalFinal: sumTf,
      kpiNetoPrenda: kpi.netoPrenda,
      kpiNetoDisplayLegacy: kpi.netoDisplay,
      kpiBrutoLista: kpi.bruto,
      kpiDescuento: kpi.desc,
      pctDiffNetoVsTf: (pct * 100).toFixed(3) + "%",
      okRemitos,
      okNeto,
    });
  }

  console.log("Remito Items KPI audit (prod)");
  console.table(rows);
  const fail = rows.filter((r) => !r.okRemitos || !r.okNeto);
  if (fail.length) {
    console.error("FAIL", fail);
    process.exit(1);
  }
  console.log("PASS — neto KPI (NETO_PRENDA) dentro de 2% vs Σ Total Final");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
