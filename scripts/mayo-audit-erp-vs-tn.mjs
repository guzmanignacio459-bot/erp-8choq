#!/usr/bin/env node
/**
 * Auditoría read-only: Mayo ERP vs Tiendanube Analytics.
 * No modifica datos.
 */

import fs from "fs";
import path from "path";

const PROD =
  process.env.PROD_URL ??
  "https://nextjs-boilerplate-topaz-iota-40.vercel.app";

const MAYO_FROM = "2026-05-01";
const MAYO_TO = "2026-05-31";
const TZ = "America/Argentina/Buenos_Aires";
const ART_OFFSET = "-03:00";

const PANEL_REPORTED = { ventas: 453, facturacion: 56684405 };

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

function artDayBoundsMs(y, m, d) {
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = `${y}-${pad(m)}-${pad(d)}`;
  return {
    startMs: Date.parse(`${ymd}T00:00:00.000${ART_OFFSET}`),
    endMs: Date.parse(`${ymd}T23:59:59.999${ART_OFFSET}`),
  };
}

function artRangeBoundsMs(fromYmd, toYmd) {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  return {
    startMs: artDayBoundsMs(fy, fm, fd).startMs,
    endMs: artDayBoundsMs(ty, tm, td).endMs,
  };
}

function parseInstantMs(iso) {
  const raw = String(iso ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    return artDayBoundsMs(y, m, d).startMs;
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function artDayKey(ms) {
  if (ms == null) return "";
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(ms));
  const pick = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function inArtRange(ms, fromYmd, toYmd) {
  if (ms == null) return false;
  const b = artRangeBoundsMs(fromYmd, toYmd);
  return ms >= b.startMs && ms <= b.endMs;
}

function fmtArt(ms) {
  if (ms == null) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function parseAmount(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  let s = String(v).trim().replace(/^\$/, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function isPaid(o) {
  const ps = String(o.payment_status ?? "").toLowerCase();
  const st = String(o.status ?? "").toLowerCase();
  if (ps === "paid" || ps === "pagado") return true;
  if (st === "paid" || st === "pagado") return true;
  if (o.paid_at) return true;
  return false;
}

function isCancelled(o) {
  const ps = String(o.payment_status ?? "").toLowerCase();
  const st = String(o.status ?? "").toLowerCase();
  return (
    ps === "voided" ||
    ps === "refunded" ||
    ps === "cancelled" ||
    ps === "canceled" ||
    st === "cancelled" ||
    st === "canceled" ||
    st === "voided"
  );
}

function pickOrderDateISO(o) {
  if (o.paid_at) return String(o.paid_at);
  if (o.completed_at?.date) return String(o.completed_at.date);
  if (o.created_at) return String(o.created_at);
  return "";
}

function tnTotal(o) {
  return parseAmount(o.total ?? o.total_price ?? o.total_paid ?? 0);
}

async function tnFetch(path) {
  const STORE = process.env.TIENDANUBE_STORE_ID;
  const TOKEN = process.env.TIENDANUBE_ACCESS_TOKEN;
  const UA = process.env.TIENDANUBE_USER_AGENT || "8Q ERP";
  const BASE = process.env.TIENDANUBE_API_URL?.trim() || "https://api.tiendanube.com/v1";
  const res = await fetch(`${BASE}/${STORE}${path}`, {
    headers: {
      Authentication: `bearer ${TOKEN}`,
      "User-Agent": UA,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, text, json };
}

async function fetchTnOrders(params, maxPages = 250) {
  const orders = [];
  for (let page = 1; page <= maxPages; page++) {
    const q = new URLSearchParams({
      ...params,
      page: String(page),
      per_page: "200",
    });
    const r = await tnFetch(`/orders?${q}`);
    if (!r.ok && r.status === 404 && /Last page is/.test(r.text)) break;
    if (!r.ok) throw new Error(`TN page ${page} status ${r.status}: ${r.text.slice(0, 200)}`);
    const batch = Array.isArray(r.json) ? r.json : [];
    if (!batch.length) break;
    orders.push(...batch);
    if (batch.length < 200) break;
    await new Promise((x) => setTimeout(x, 200));
  }
  return orders;
}

async function fetchErpRemitos() {
  const res = await fetch(`${PROD}/api/erp/remitos`, { cache: "no-store" });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "ERP remitos fail");
  return json.data ?? [];
}

function buildErpMayo(remitos) {
  const bounds = artRangeBoundsMs(MAYO_FROM, MAYO_TO);
  return remitos
    .map((r) => {
      const ms = parseInstantMs(r.fechaRaw || r.fechaDisplay || r.fecha || "");
      return {
        idRemito: String(r.idRemito ?? "").trim(),
        tnOrderId: String(r.tnOrderId ?? "").trim(),
        fechaRaw: r.fechaRaw ?? "",
        fechaArt: ms != null ? artDayKey(ms) : "",
        fechaMs: ms,
        totalFinal: parseAmount(r.totalFinal),
        estado: String(r.estado ?? "").trim(),
        metodoDePago: String(r.metodoDePago ?? "").trim(),
        nombre: String(r.nombre ?? "").trim(),
        inMayo: ms != null && ms >= bounds.startMs && ms <= bounds.endMs,
      };
    })
    .filter((r) => r.inMayo);
}

function buildTnUniverses(orders) {
  const byId = new Map();
  for (const o of orders) byId.set(String(o.id), o);

  const panelPaidAtArt = [];
  const panelCreatedAtArt = [];
  const importListCreatedMayo = [];
  const paidAnyStatus = [];

  const fromISO = `${MAYO_FROM}T00:00:00.000Z`;
  const toISO = `${MAYO_TO}T23:59:59.999Z`;

  for (const o of byId.values()) {
    const id = String(o.id);
    const paidMs = o.paid_at ? parseInstantMs(String(o.paid_at)) : null;
    const createdMs = o.created_at ? parseInstantMs(String(o.created_at)) : null;
    const pickMs = parseInstantMs(pickOrderDateISO(o));

    if (isPaid(o) && inArtRange(paidMs, MAYO_FROM, MAYO_TO)) {
      panelPaidAtArt.push({
        orderId: id,
        paidMs,
        createdMs,
        pickMs,
        total: tnTotal(o),
        paymentStatus: String(o.payment_status ?? ""),
        status: String(o.status ?? ""),
        cancelled: isCancelled(o),
        paidAtArt: artDayKey(paidMs),
        createdAtArt: createdMs ? artDayKey(createdMs) : "",
      });
    }

    if (inArtRange(createdMs, MAYO_FROM, MAYO_TO)) {
      panelCreatedAtArt.push({
        orderId: id,
        paid: isPaid(o),
        paidMs,
        createdMs,
        total: tnTotal(o),
        paymentStatus: String(o.payment_status ?? ""),
        status: String(o.status ?? ""),
        cancelled: isCancelled(o),
      });
      if (isPaid(o)) importListCreatedMayo.push(id);
    }

    if (isPaid(o)) paidAnyStatus.push(o);
  }

  return {
    byId,
    panelPaidAtArt,
    panelCreatedAtArt,
    importListCreatedMayo: new Set(importListCreatedMayo),
    fromISO,
    toISO,
  };
}

function sum(arr, fn) {
  return arr.reduce((a, x) => a + fn(x), 0);
}

function classifyErpOnly(row, tnById, erpByTn) {
  const tn = row.tnOrderId;
  const reasons = [];

  if (!tn) {
    reasons.push("sin_tn_order_id");
    return reasons;
  }

  const siblings = erpByTn.get(tn) ?? [];
  if (siblings.length > 1) reasons.push("duplicada_tn");

  const o = tnById.get(tn);
  if (!o) {
    reasons.push("tn_no_encontrada_api");
    return reasons;
  }

  const paidMs = o.paid_at ? parseInstantMs(String(o.paid_at)) : null;
  const createdMs = o.created_at ? parseInstantMs(String(o.created_at)) : null;

  if (isCancelled(o)) reasons.push("cancelada_en_tn");

  if (!isPaid(o)) reasons.push("no_pagada_en_tn");

  if (paidMs != null && !inArtRange(paidMs, MAYO_FROM, MAYO_TO)) {
    reasons.push("paid_at_fuera_mayo_art");
    if (createdMs != null && inArtRange(createdMs, MAYO_FROM, MAYO_TO)) {
      reasons.push("timezone_created_mayo_paid_otro_mes");
    }
  }

  if (
    paidMs != null &&
    inArtRange(paidMs, MAYO_FROM, MAYO_TO) &&
    row.fechaArt !== artDayKey(paidMs)
  ) {
    reasons.push("fecha_erp_distinta_paid_at_art");
  }

  if (
    row.estado &&
    /cancel/i.test(row.estado) &&
    !isCancelled(o)
  ) {
    reasons.push("estado_erp_cancelado_tn_no");
  }

  if (!reasons.length) reasons.push("en_tn_mayo_pero_remito_extra_o_clasif_pendiente");
  return reasons;
}

function classifyTnOnly(row, erpByTn) {
  const reasons = [];
  const erpRows = erpByTn.get(row.orderId) ?? [];

  if (erpRows.length === 0) {
    reasons.push("sin_remito_erp");
    if (row.cancelled) reasons.push("cancelada");
    return reasons;
  }

  const anyInMayo = erpRows.some((r) => r.inMayo);
  if (!anyInMayo) {
    reasons.push("remito_erp_fuera_mayo");
    const fechas = erpRows.map((r) => r.fechaArt).join(",");
    reasons.push(`erp_fechas:${fechas}`);
  }

  if (erpRows.length > 1 && anyInMayo) reasons.push("erp_duplicada_pero_tn_cuenta_1");

  if (!reasons.length) reasons.push("clasif_pendiente");
  return reasons;
}

async function main() {
  loadEnvLocal();

  console.log("=== Auditoría Mayo ERP vs Tiendanube ===");
  console.log("PROD:", PROD);
  console.log("Rango ART:", MAYO_FROM, "→", MAYO_TO);
  console.log("---");

  const remitos = await fetchErpRemitos();
  const erpMayo = buildErpMayo(remitos);

  const erpByTn = new Map();
  for (const r of erpMayo) {
    if (!r.tnOrderId) continue;
    if (!erpByTn.has(r.tnOrderId)) erpByTn.set(r.tnOrderId, []);
    erpByTn.get(r.tnOrderId).push(r);
  }

  const erpTotals = {
    remitos: erpMayo.length,
    facturacion: sum(erpMayo, (r) => r.totalFinal),
    tnUnicos: erpByTn.size,
    sinTn: erpMayo.filter((r) => !r.tnOrderId).length,
    duplicadasTn: [...erpByTn.values()].filter((a) => a.length > 1).length,
    filasDuplicadasExtra: sum(
      [...erpByTn.values()].filter((a) => a.length > 1),
      (a) => a.length - 1
    ),
  };

  console.log("\n1. Universo ERP Mayo");
  console.table(erpTotals);

  console.error("Fetching TN orders (paid Oct-May + any-status Mayo)...");
  const tnPaidPool = await fetchTnOrders({
    payment_status: "paid",
    created_at_min: "2025-10-01T00:00:00.000Z",
    created_at_max: "2026-05-31T23:59:59.999Z",
  });
  const tnMayoAny = await fetchTnOrders({
    payment_status: "any",
    created_at_min: "2026-05-01T00:00:00.000Z",
    created_at_max: "2026-05-31T23:59:59.999Z",
  });

  const merged = new Map();
  for (const o of [...tnPaidPool, ...tnMayoAny]) merged.set(String(o.id), o);
  const tn = buildTnUniverses([...merged.values()]);

  const tnPanel = tn.panelPaidAtArt.filter((r) => !r.cancelled);
  const panelPaidAtArtCount = tnPanel.length;
  const panelFacturacion = sum(tnPanel, (r) => r.total);
  const tnTotals = {
    panelPaidAtArt: panelPaidAtArtCount,
    panelFacturacion,
    panelReportedVentas: PANEL_REPORTED.ventas,
    panelReportedFacturacion: PANEL_REPORTED.facturacion,
    deltaVentasVsPanel: erpTotals.remitos - PANEL_REPORTED.ventas,
    deltaFacturacionVsPanel: erpTotals.facturacion - PANEL_REPORTED.facturacion,
    proxyDeltaVentas: erpTotals.remitos - panelPaidAtArtCount,
    proxyDeltaFacturacion: erpTotals.facturacion - panelFacturacion,
    createdAtArtPaid: tn.panelCreatedAtArt.filter((r) => r.paid && !r.cancelled).length,
    importListCreatedMayoPaid: tn.importListCreatedMayo.size,
  };

  console.log("\n2. Universo TN Mayo (proxy paid_at ART, pagadas no canceladas)");
  console.table(tnTotals);

  const tnPanelIds = new Set(tnPanel.map((r) => r.orderId));
  const erpTnIdsInMayo = new Set(
    erpMayo.filter((r) => r.tnOrderId).map((r) => r.tnOrderId)
  );

  const erpOnlyRows = erpMayo.filter(
    (r) => !r.tnOrderId || !tnPanelIds.has(r.tnOrderId)
  );
  const tnOnlyRows = tnPanel.filter((r) => !erpTnIdsInMayo.has(r.orderId));

  const erpOnlyEnriched = erpOnlyRows.map((r) => ({
    idRemito: r.idRemito,
    tnOrderId: r.tnOrderId || "—",
    totalFinal: r.totalFinal,
    fechaArt: r.fechaArt,
    estado: r.estado,
    nombre: r.nombre,
    motivos: classifyErpOnly(r, tn.byId, erpByTn),
  }));

  const tnOnlyEnriched = tnOnlyRows.map((r) => ({
    orderId: r.orderId,
    total: r.total,
    paidAtArt: r.paidAtArt,
    createdAtArt: r.createdAtArt,
    paymentStatus: r.paymentStatus,
    status: r.status,
    motivos: classifyTnOnly(r, erpByTn),
  }));

  const erpOnlyByMotivo = {};
  for (const row of erpOnlyEnriched) {
    for (const m of row.motivos) {
      if (!erpOnlyByMotivo[m]) erpOnlyByMotivo[m] = { count: 0, total: 0, rows: [] };
      erpOnlyByMotivo[m].count++;
      erpOnlyByMotivo[m].total += row.totalFinal;
      erpOnlyByMotivo[m].rows.push(row);
    }
  }

  const tnOnlyByMotivo = {};
  for (const row of tnOnlyEnriched) {
    for (const m of row.motivos) {
      if (!tnOnlyByMotivo[m]) tnOnlyByMotivo[m] = { count: 0, total: 0, rows: [] };
      tnOnlyByMotivo[m].count++;
      tnOnlyByMotivo[m].total += row.total;
      tnOnlyByMotivo[m].rows.push(row);
    }
  }

  console.log("\n3. Solo en ERP (remitos Mayo no en TN panel proxy)");
  console.table({
    filas: erpOnlyRows.length,
    facturacion: sum(erpOnlyRows, (r) => r.totalFinal),
    tnUnicos: new Set(erpOnlyRows.map((r) => r.tnOrderId).filter(Boolean)).size,
  });

  console.log("\n4. Solo en TN (paid_at Mayo ART, sin TN en ERP Mayo)");
  console.table({
    ordenes: tnOnlyRows.length,
    facturacion: sum(tnOnlyRows, (r) => r.total),
  });

  console.log("\n5. Totales monetarios diferencia");
  console.table({
    erpFacturacion: erpTotals.facturacion,
    tnPanelReportado: PANEL_REPORTED.facturacion,
    tnProxyPaidAtArt: tnTotals.panelFacturacion,
    diffErpVsPanelReportado: erpTotals.facturacion - PANEL_REPORTED.facturacion,
    diffErpVsTnProxy: erpTotals.facturacion - tnTotals.panelFacturacion,
    erpOnly$: sum(erpOnlyRows, (r) => r.totalFinal),
    tnOnly$: sum(tnOnlyRows, (r) => r.total),
    duplicadasExtra$: sum(
      [...erpByTn.values()].filter((a) => a.length > 1),
      (a) => sum(a.slice(1), (r) => r.totalFinal)
    ),
  });

  console.log("\n6a. Clasificación ERP-only por motivo");
  console.table(
    Object.fromEntries(
      Object.entries(erpOnlyByMotivo).map(([k, v]) => [
        k,
        { count: v.count, total: Math.round(v.total * 100) / 100 },
      ])
    )
  );

  console.log("\n6b. Clasificación TN-only por motivo");
  console.table(
    Object.fromEntries(
      Object.entries(tnOnlyByMotivo).map(([k, v]) => [
        k,
        { count: v.count, total: Math.round(v.total * 100) / 100 },
      ])
    )
  );

  const dupGroups = [...erpByTn.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([tn, rows]) => ({
      tnOrderId: tn,
      remitos: rows.length,
      ids: rows.map((r) => r.idRemito).join(", "),
      total: sum(rows, (r) => r.totalFinal),
      extraTotal: sum(rows.slice(1), (r) => r.totalFinal),
    }));

  console.log("\n6c. Duplicadas TN en ERP Mayo");
  console.table(dupGroups);

  const timezoneCases = erpOnlyEnriched.filter((r) =>
    r.motivos.some((m) => m.includes("timezone") || m.includes("paid_at_fuera"))
  );
  const cancelledCases = [
    ...erpOnlyEnriched.filter((r) => r.motivos.includes("cancelada_en_tn")),
    ...tnOnlyEnriched.filter((r) => r.motivos.includes("cancelada")),
  ];

  const out = {
    generatedAt: new Date().toISOString(),
    mayoRange: { from: MAYO_FROM, to: MAYO_TO, tz: TZ },
    erp: erpTotals,
    tn: tnTotals,
    panelReported: PANEL_REPORTED,
    erpOnly: {
      summary: {
        filas: erpOnlyRows.length,
        facturacion: sum(erpOnlyRows, (r) => r.totalFinal),
      },
      byMotivo: erpOnlyByMotivo,
      rows: erpOnlyEnriched,
    },
    tnOnly: {
      summary: {
        ordenes: tnOnlyRows.length,
        facturacion: sum(tnOnlyRows, (r) => r.total),
      },
      byMotivo: tnOnlyByMotivo,
      rows: tnOnlyEnriched,
    },
    duplicadasTn: dupGroups,
    timezoneCases,
    cancelledCases,
    reconciliacion: {
      erpRemitos: erpTotals.remitos,
      tnPanelReportado: PANEL_REPORTED.ventas,
      deltaFilas: erpTotals.remitos - PANEL_REPORTED.ventas,
      explicacionDuplicadas: erpTotals.filasDuplicadasExtra,
      erpOnlyFilas: erpOnlyRows.length,
      tnOnlyOrdenes: tnOnlyRows.length,
      netoTeorico:
        PANEL_REPORTED.ventas +
        erpTotals.filasDuplicadasExtra +
        erpOnlyRows.length -
        tnOnlyRows.length,
    },
  };

  const outPath = path.join(process.cwd(), "_wip/mayo-audit-erp-vs-tn.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nJSON completo: ${outPath}`);

  console.log("\n=== DETALLE ERP-ONLY (top filas) ===");
  console.table(
    erpOnlyEnriched
      .sort((a, b) => b.totalFinal - a.totalFinal)
      .slice(0, 25)
      .map((r) => ({
        idRemito: r.idRemito,
        tn: r.tnOrderId,
        $: r.totalFinal,
        fecha: r.fechaArt,
        motivos: r.motivos.join("|"),
      }))
  );

  if (tnOnlyEnriched.length) {
    console.log("\n=== DETALLE TN-ONLY ===");
    console.table(tnOnlyEnriched);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
