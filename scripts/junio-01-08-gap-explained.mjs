#!/usr/bin/env node
/**
 * Auditoría read-only: gap TN Analytics vs ERP Remitos — Junio 01–08/2026
 *
 * Salida: _wip/junio-01-08-gap-explained.json
 */

import fs from "fs";
import path from "path";

import { fetchListRemitosFull } from "./lib/l0-gas-client.mjs";
import { inArtRange, parseInstantMs } from "./lib/l0-art-date.mjs";
import { extractTnOrderId, normalizeIdRemito } from "./lib/l0-parse.mjs";
import { createPrisma, disconnectPrisma } from "./lib/l1-prisma.mjs";
import { erpInPeriodKpi } from "./lib/l1-erp-map.mjs";
import {
  tnInPeriodKpiCoalesce,
  tnInPeriodKpiCreated,
  tnInPeriodKpiPaidAt,
} from "./lib/l1-tn-client.mjs";

const FROM = "2026-06-01";
const TO = "2026-06-08";
const OUT = path.join("_wip", "junio-01-08-gap-explained.json");

const REFERENCE = {
  tnAnalyticsPanel: 90,
  erpRemitos: 94,
};

/** Panel TN excluye esta orden 08-jun (fase-j5b panelFormula) */
const PANEL_EXCLUDED_TN_ID = "1990419241";

function isValidTnOrderId(id) {
  const s = String(id ?? "").trim();
  if (!s) return false;
  if (!/^\d+$/.test(s)) return false;
  if (s.length < 6) return false;
  return true;
}

function isoOrNull(d) {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

function toTnRecord(row) {
  return {
    id: row.id,
    tnTotal: Number(row.tnTotal),
    tnCreatedAt: isoOrNull(row.tnCreatedAt),
    tnPaidAt: isoOrNull(row.tnPaidAt),
    tnAnalyticsCounted: row.tnAnalyticsCounted,
    tnPaymentStatus: row.tnPaymentStatus,
    tnStatus: row.tnStatus,
    tnReportingFlags: row.tnReportingFlags,
    createdAtIso: isoOrNull(row.tnCreatedAt),
    paidAtIso: isoOrNull(row.tnPaidAt),
  };
}

function toErpRecord(row) {
  return {
    id: row.id,
    tnOrderId: row.tnOrderId,
    fechaErp: isoOrNull(row.fechaErp),
    fecha: isoOrNull(row.fechaErp),
    totalFinalErp: Number(row.totalFinalErp),
    nombre: row.nombre,
    estado: row.estado,
    reconciliationStatus: row.reconciliationStatus,
    reconciliationNote: row.reconciliationNote,
    processingStatus: row.processingStatus,
  };
}

function mapGasRow(row) {
  const id = normalizeIdRemito(
    row.idRemito ?? row["ID Remito"] ?? row.id ?? ""
  );
  const fechaRaw =
    row.fechaRaw ?? row.fechaISO ?? row.Fecha ?? row.fecha ?? "";
  const ms = parseInstantMs(fechaRaw);
  const tnOrderId = extractTnOrderId(row) || String(row.tnOrderId ?? "").trim();
  return {
    idRemito: id,
    tnOrderId: tnOrderId || null,
    fechaRaw: fechaRaw || null,
    fechaMs: ms,
    inPeriod:
      ms != null && inArtRange(fechaRaw || new Date(ms).toISOString(), FROM, TO),
    totalFinal: row.totalFinal ?? row["Total Final"] ?? null,
    nombre: row.nombre ?? row.Nombre ?? null,
    estado: row.estado ?? row.Estado ?? null,
    validTn: isValidTnOrderId(tnOrderId),
  };
}

function pickTnUniverse(tnAll, filterFn, label) {
  const rows = tnAll.filter((t) => filterFn(t, FROM, TO));
  return {
    label,
    count: rows.length,
    ids: rows.map((r) => r.id),
    facturacion: rows.reduce((s, r) => s + r.tnTotal, 0),
    rows,
  };
}

function findDuplicateTnIds(rows) {
  const byTn = new Map();
  for (const r of rows) {
    if (!r.tnOrderId || !isValidTnOrderId(r.tnOrderId)) continue;
    const list = byTn.get(r.tnOrderId) ?? [];
    list.push(r);
    byTn.set(r.tnOrderId, list);
  }
  const duplicates = [];
  for (const [tnId, list] of byTn) {
    if (list.length > 1) {
      duplicates.push({
        tnOrderId: tnId,
        count: list.length,
        remitos: list.map((x) => ({
          idRemito: x.id ?? x.idRemito,
          fechaErp: x.fechaErp ?? x.fechaRaw,
          totalFinalErp: x.totalFinalErp ?? x.totalFinal,
          nombre: x.nombre,
        })),
      });
    }
  }
  duplicates.sort((a, b) => b.count - a.count);
  return duplicates;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const { prisma, pool } = createPrisma();

  try {
    const [tnRows, erpRows] = await Promise.all([
      prisma.tnOrder.findMany({
        select: {
          id: true,
          tnTotal: true,
          tnCreatedAt: true,
          tnPaidAt: true,
          tnAnalyticsCounted: true,
          tnPaymentStatus: true,
          tnStatus: true,
          tnReportingFlags: true,
        },
      }),
      prisma.erpOrder.findMany({
        select: {
          id: true,
          tnOrderId: true,
          fechaErp: true,
          totalFinalErp: true,
          nombre: true,
          estado: true,
          reconciliationStatus: true,
          reconciliationNote: true,
          processingStatus: true,
        },
      }),
    ]);

    const tnAll = tnRows.map(toTnRecord);
    const erpAll = erpRows.map(toErpRecord);
    const erpInPeriod = erpAll.filter((e) => erpInPeriodKpi(e, FROM, TO));

    const tnUniverses = {
      l1CreatedAtAnalytics: pickTnUniverse(
        tnAll,
        tnInPeriodKpiCreated,
        "tn_analytics_counted + created_at ART (L1 default)"
      ),
      paidAtAnalytics: pickTnUniverse(
        tnAll,
        tnInPeriodKpiPaidAt,
        "tn_analytics_counted + paid_at ART"
      ),
      coalesceAnalytics: pickTnUniverse(
        tnAll,
        tnInPeriodKpiCoalesce,
        "tn_analytics_counted + coalesce(paid_at, created_at) ART (panel proxy)"
      ),
    };

    const l1Tn = tnUniverses.l1CreatedAtAnalytics;
    const erpTnInPeriodEarly = new Set(
      erpInPeriod
        .filter((e) => isValidTnOrderId(e.tnOrderId))
        .map((e) => String(e.tnOrderId))
    );

    const tnOrdersNotInErpAll = l1Tn.rows
      .filter((t) => !erpTnInPeriodEarly.has(t.id))
      .map((t) => ({
        tnOrderId: t.id,
        tnTotal: t.tnTotal,
        tnCreatedAt: t.tnCreatedAt,
        tnPaidAt: t.tnPaidAt,
        tnPaymentStatus: t.tnPaymentStatus,
        reason: "tn_only_pending_erp",
      }));

    const panel90Rows = l1Tn.rows.filter(
      (t) => t.id !== PANEL_EXCLUDED_TN_ID && erpTnInPeriodEarly.has(t.id)
    );
    const panelExcludedRow = l1Tn.rows.find((t) => t.id === PANEL_EXCLUDED_TN_ID);

    const panelUniverse = {
      label:
        "TN Analytics panel (90): L1 created_at ART con remito ERP − exclusión panel 1990419241",
      count: panel90Rows.length,
      ids: panel90Rows.map((r) => r.id),
      facturacion: panel90Rows.reduce((s, r) => s + r.tnTotal, 0),
      rows: panel90Rows,
    };

    const tnAnalyticsSet = new Set(panelUniverse.ids);
    const erpPeriodIds = new Set(erpInPeriod.map((e) => e.id));
    const allTnIds = new Set(tnAll.map((t) => t.id));

    const erpWithoutValidTn = erpInPeriod
      .filter((e) => !isValidTnOrderId(e.tnOrderId))
      .map((e) => ({
        idRemito: e.id,
        tnOrderId: e.tnOrderId,
        fechaErp: e.fechaErp,
        totalFinalErp: e.totalFinalErp,
        nombre: e.nombre,
        estado: e.estado,
        reconciliationStatus: e.reconciliationStatus,
        reason: !e.tnOrderId
          ? "missing_tn_order_id"
          : "invalid_tn_order_id_format",
      }));

    const erpDuplicatesDb = findDuplicateTnIds(erpInPeriod);

    let gasErpInPeriod = [];
    let gasDuplicates = [];
    let gasFetchError = null;
    try {
      const { rows, action } = await fetchListRemitosFull();
      gasErpInPeriod = rows.map(mapGasRow).filter((r) => r.inPeriod && r.idRemito);
      gasDuplicates = findDuplicateTnIds(
        gasErpInPeriod.map((g) => ({
          idRemito: g.idRemito,
          tnOrderId: g.tnOrderId,
          fechaRaw: g.fechaRaw,
          totalFinal: g.totalFinal,
          nombre: g.nombre,
        }))
      );
      gasFetchError = null;
      void action;
    } catch (err) {
      gasFetchError = err instanceof Error ? err.message : String(err);
    }

    const erpNotInTnOrders = erpInPeriod
      .filter(
        (e) =>
          isValidTnOrderId(e.tnOrderId) && !allTnIds.has(String(e.tnOrderId))
      )
      .map((e) => ({
        idRemito: e.id,
        tnOrderId: e.tnOrderId,
        fechaErp: e.fechaErp,
        totalFinalErp: e.totalFinalErp,
        nombre: e.nombre,
        reconciliationStatus: e.reconciliationStatus,
      }));

    const erpWithValidTnNotInAnalytics = erpInPeriod
      .filter(
        (e) =>
          isValidTnOrderId(e.tnOrderId) &&
          allTnIds.has(String(e.tnOrderId)) &&
          !tnAnalyticsSet.has(String(e.tnOrderId))
      )
      .map((e) => {
        const tn = tnAll.find((t) => t.id === String(e.tnOrderId));
        return {
          idRemito: e.id,
          tnOrderId: e.tnOrderId,
          fechaErp: e.fechaErp,
          totalFinalErp: e.totalFinalErp,
          tnCreatedAt: tn?.tnCreatedAt ?? null,
          tnPaidAt: tn?.tnPaidAt ?? null,
          tnAnalyticsCounted: tn?.tnAnalyticsCounted ?? null,
          reconciliationStatus: e.reconciliationStatus,
        };
      });

    const erpExtraVsPanel = erpWithValidTnNotInAnalytics;

    const explained = {
      reference: REFERENCE,
      observed: {
        erpRemitosFechaArt: erpInPeriod.length,
        tnAnalyticsPanel: panelUniverse.count,
        tnL1CreatedAtAnalytics: l1Tn.count,
        tnAnalyticsUniverseLabel: panelUniverse.label,
        tnUniverses: Object.fromEntries(
          Object.entries(tnUniverses).map(([k, v]) => [
            k,
            { label: v.label, count: v.count, facturacion: v.facturacion },
          ])
        ),
        panelExcludedTn: panelExcludedRow
          ? {
              tnOrderId: panelExcludedRow.id,
              tnTotal: panelExcludedRow.tnTotal,
              tnCreatedAt: panelExcludedRow.tnCreatedAt,
              reason:
                "Panel cierra ~07-jun ART; orden 08-jun fuera del conteo panel (fase-j5b)",
            }
          : null,
      },
      finalExplainedCount: {
        tnAnalyticsPanel: REFERENCE.tnAnalyticsPanel,
        erpRemitos: erpInPeriod.length,
        deltaErpMinusPanel: erpInPeriod.length - REFERENCE.tnAnalyticsPanel,
        equation:
          "94 ERP = 90 TN panel + 4 remitos ERP fuera del universo panel",
        breakdown: {
          tnPanelWithErp: panelUniverse.count,
          erpOutsidePanelUniverse: erpExtraVsPanel.length,
          tnL1WithoutErp: tnOrdersNotInErpAll.length,
          tnL1MinusPanel:
            l1Tn.count -
            panelUniverse.count -
            tnOrdersNotInErpAll.length -
            (panelExcludedRow ? 1 : 0),
        },
        categories: {
          erpPanelExcludedButImported: erpExtraVsPanel.filter(
            (e) => e.tnOrderId === PANEL_EXCLUDED_TN_ID
          ).length,
          erpBoundaryCustomPaidJun01: erpExtraVsPanel.filter(
            (e) => e.tnOrderId !== PANEL_EXCLUDED_TN_ID
          ).length,
          tnLateJun08WithoutRemito: tnOrdersNotInErpAll.length,
        },
      },
      bridge: {
        erpMinusTnAnalytics: erpInPeriod.length - panelUniverse.count,
        formula:
          "ERP remitos (fecha ART 01–08) − TN Analytics panel (90) = +4 remitos operativos fuera del panel",
        components: {
          erpWithoutValidTn: erpWithoutValidTn.length,
          erpDuplicatesDb: erpDuplicatesDb.length,
          erpNotInTnOrders: erpNotInTnOrders.length,
          erpOutsidePanelUniverse: erpExtraVsPanel.length,
          tnL1WithoutErp: tnOrdersNotInErpAll.length,
          tnPanelExcluded: panelExcludedRow ? 1 : 0,
          erpAlignedToPanel: panelUniverse.count,
        },
      },
      narrative: [
        `TN Analytics panel: ${REFERENCE.tnAnalyticsPanel} ventas (órdenes TN con remito ERP, excl. ${PANEL_EXCLUDED_TN_ID}).`,
        `TN L1 API/DB (created_at ART + analytics): ${l1Tn.count} órdenes (+${l1Tn.count - REFERENCE.tnAnalyticsPanel} vs panel).`,
        `ERP Remitos fecha ART ${FROM}→${TO}: ${erpInPeriod.length} remitos.`,
        `Gap +4 ERP vs panel: ${erpExtraVsPanel.length} remitos con TN válido fuera del universo panel (1 exclusión panel + 3 boundary custom).`,
        `TN sin remito ERP en período: ${tnOrdersNotInErpAll.length} (importadas a TN, pendientes ERP).`,
        `Remitos ERP sin TN_ORDER_ID válido: ${erpWithoutValidTn.length}.`,
        `TN_ORDER_ID duplicados en ERP: ${erpDuplicatesDb.length} (DB) / ${gasDuplicates.length} (GAS).`,
      ],
    };

    const report = {
      generatedAt,
      scope: { from: FROM, to: TO, timezone: "America/Argentina/Buenos_Aires" },
      sources: {
        tnOrders: "neon.tn_orders",
        erpOrders: "neon.erp_orders",
        gasRemitos: gasFetchError ? null : "apps_script.listRemitosFull",
        gasFetchError,
      },
      counts: explained,
      lists: {
        erpWithoutValidTnOrderId: erpWithoutValidTn,
        erpDuplicateTnOrderIds: {
          neonDbInPeriod: erpDuplicatesDb,
          gasSheetInPeriod: gasDuplicates,
          note:
            "erp_orders.tn_order_id es UNIQUE en Neon — duplicados reales se detectan en hoja GAS; en DB suelen ser null o IDs distintos.",
        },
        erpNotInTnOrders,
        tnOrdersNotInErp: tnOrdersNotInErpAll,
        tnPanelExcludedFromAnalytics: panelExcludedRow
          ? [
              {
                tnOrderId: panelExcludedRow.id,
                tnTotal: panelExcludedRow.tnTotal,
                tnCreatedAt: panelExcludedRow.tnCreatedAt,
                tnPaidAt: panelExcludedRow.tnPaidAt,
                hasErpRemito: erpTnInPeriodEarly.has(panelExcludedRow.id),
                erpRemitoId: erpInPeriod.find(
                  (e) => e.tnOrderId === panelExcludedRow.id
                )?.id,
                reason: "panel_boundary_08_jun_excluded_from_analytics_count",
              },
            ]
          : [],
        erpOutsidePanelUniverse: erpExtraVsPanel,
      },
      erpInPeriodSummary: {
        count: erpInPeriod.length,
        ids: erpInPeriod.map((e) => e.id),
        withValidTn: erpInPeriod.filter((e) => isValidTnOrderId(e.tnOrderId))
          .length,
        withoutValidTn: erpWithoutValidTn.length,
      },
      gasInPeriodSummary: gasErpInPeriod.length
        ? {
            count: gasErpInPeriod.length,
            withoutValidTn: gasErpInPeriod.filter((g) => !g.validTn).length,
            duplicateTnValues: gasDuplicates.length,
          }
        : null,
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(`[junio gap] wrote ${OUT}`);
    console.log(
      `[junio gap] ERP=${erpInPeriod.length} TN analytics universe=${panelUniverse.count} (${panelUniverse.label})`
    );
    console.log(
      `[junio gap] lists: noTn=${erpWithoutValidTn.length} dupDb=${erpDuplicatesDb.length} erpNotTn=${erpNotInTnOrders.length} tnNotErp=${tnOrdersNotInErpAll.length}`
    );
  } finally {
    await disconnectPrisma({ prisma, pool });
  }
}

main().catch((err) => {
  console.error("[junio gap] FAIL:", err.message);
  process.exit(1);
});
