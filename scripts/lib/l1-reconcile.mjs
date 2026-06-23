/**
 * L1 — Reconciliación TN ↔ ERP (memoria o post-DB)
 */

import { erpInPeriodKpi, sumErpKpi } from "./l1-erp-map.mjs";
import { sumTnKpi, tnInPeriodKpi } from "./l1-tn-client.mjs";
import { L1_PERIODS } from "./l1-periods.mjs";

export const MONEY_TOLERANCE = 1.0;

export function computePairStatus(tn, erp) {
  if (!tn && !erp) return { status: "unknown", note: "sin datos" };
  if (tn && !erp) {
    return {
      status: "tn_only_pending_erp",
      note: "TN paid sin remito ERP",
    };
  }
  if (!tn && erp) {
    if (!erp.tnOrderId) {
      return {
        status: "erp_only_not_in_panel",
        note: "Remito manual sin TN",
      };
    }
    return {
      status: "erp_only_not_in_panel",
      note: "ERP con TN id pero TN no en universo KPI del período",
    };
  }

  const diff = Math.abs((tn.tnTotal ?? 0) - (erp.totalFinalErp ?? 0));
  if (diff > MONEY_TOLERANCE) {
    return {
      status: "mismatch_amount",
      note: `Δ total $${diff.toFixed(2)} (TN ${tn.tnTotal} vs ERP ${erp.totalFinalErp})`,
    };
  }

  if (!tn.tnAnalyticsCounted) {
    return {
      status: "erp_only_not_in_panel",
      note: "TN excluida de analytics (cancelada/refund)",
    };
  }

  return { status: "aligned", note: null };
}

export function reconcileLayers({ tnRecords, erpOrders }) {
  const tnById = new Map(tnRecords.map((t) => [t.id, t]));
  const erpByTn = new Map();
  const erpById = new Map();

  for (const e of erpOrders) {
    erpById.set(e.id, e);
    if (e.tnOrderId) erpByTn.set(e.tnOrderId, e);
  }

  const pairs = [];
  const seenTn = new Set();
  const seenErp = new Set();

  for (const tn of tnRecords) {
    const erp = erpByTn.get(tn.id) ?? null;
    const { status, note } = computePairStatus(tn, erp);
    pairs.push({
      tnOrderId: tn.id,
      erpOrderId: erp?.id ?? null,
      reconciliationStatus: status,
      reconciliationNote: note,
      tnTotal: tn.tnTotal,
      totalFinalErp: erp?.totalFinalErp ?? null,
    });
    seenTn.add(tn.id);
    if (erp) seenErp.add(erp.id);
  }

  for (const erp of erpOrders) {
    if (seenErp.has(erp.id)) continue;
    const tn = erp.tnOrderId ? tnById.get(erp.tnOrderId) : null;
    const { status, note } = computePairStatus(tn, erp);
    pairs.push({
      tnOrderId: erp.tnOrderId,
      erpOrderId: erp.id,
      reconciliationStatus: status,
      reconciliationNote: note,
      tnTotal: tn?.tnTotal ?? null,
      totalFinalErp: erp.totalFinalErp,
    });
    seenErp.add(erp.id);
  }

  const byStatus = {};
  for (const p of pairs) {
    byStatus[p.reconciliationStatus] = (byStatus[p.reconciliationStatus] ?? 0) + 1;
  }

  return { pairs, byStatus };
}

export function buildPeriodReport(tnRecords, erpOrders) {
  const periods = [];

  for (const period of L1_PERIODS) {
    const tnKpiAll = sumTnKpi(tnRecords, period.from, period.to);
    const tnKpi = tnKpiAll.primary;
    const erpKpi = sumErpKpi(erpOrders, period.from, period.to);

    const tnSet = new Set(tnKpi.ids);
    const erpTnSet = new Set(erpKpi.tnIds);

    const tnOnly = tnKpi.ids.filter((id) => !erpTnSet.has(id));
    const erpOnlyTn = erpKpi.tnIds.filter((id) => !tnSet.has(id));

    const tnInScope = tnRecords.filter((t) =>
      tnInPeriodKpi(t, period.from, period.to)
    );
    const erpInScope = erpOrders.filter((e) =>
      erpInPeriodKpi(e, period.from, period.to)
    );

    const scopedPairs = reconcileLayers({
      tnRecords: tnInScope,
      erpOrders: erpInScope,
    });

    const mismatches = scopedPairs.pairs.filter(
      (p) => p.reconciliationStatus === "mismatch_amount"
    );

    periods.push({
      key: period.key,
      label: period.label,
      from: period.from,
      to: period.to,
      kpi: {
        /** Comercial — fuente tn_orders */
        tn: {
          orders: tnKpi.orders,
          facturacion: Math.round(tnKpi.facturacion * 100) / 100,
          variants: {
            createdAtArt: {
              orders: tnKpiAll.primary.orders,
              facturacion:
                Math.round(tnKpiAll.primary.facturacion * 100) / 100,
            },
            paidAtArt: {
              orders: tnKpiAll.paidAtArt.orders,
              facturacion:
                Math.round(tnKpiAll.paidAtArt.facturacion * 100) / 100,
            },
            coalesceArt: {
              orders: tnKpiAll.coalesceArt.orders,
              facturacion:
                Math.round(tnKpiAll.coalesceArt.facturacion * 100) / 100,
            },
          },
        },
        /** Operativo — fuente erp_orders */
        erp: {
          remitos: erpKpi.remitos,
          facturacion: Math.round(erpKpi.facturacion * 100) / 100,
          netoOperativo: Math.round(erpKpi.netoOperativo * 100) / 100,
        },
        delta: {
          orders: erpKpi.remitos - tnKpi.orders,
          facturacion:
            Math.round((erpKpi.facturacion - tnKpi.facturacion) * 100) / 100,
        },
      },
      reconciliation: scopedPairs.byStatus,
      tnOnlyPendingErp: tnOnly,
      erpOnlyNotInTn: erpOnlyTn,
      erpManualNoTn: erpInScope
        .filter((e) => !e.tnOrderId)
        .map((e) => e.id),
      mismatches: mismatches.map((m) => ({
        tnOrderId: m.tnOrderId,
        erpOrderId: m.erpOrderId,
        tnTotal: m.tnTotal,
        totalFinalErp: m.totalFinalErp,
        note: m.reconciliationNote,
      })),
    });
  }

  return periods;
}
