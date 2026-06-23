/**
 * Mapeo respuesta GAS getAnalyticsSummary → ErpAnalyticsSummary.
 * Usado cuando el Web App exponga la acción (Fase 3.1+ GAS).
 */

import type {
  ErpAnalyticsMetaPlaceholder,
  ErpAnalyticsSummary,
  ErpAnalyticsTopProductsSection,
} from "@/types/erp";

const DEFAULT_META: ErpAnalyticsMetaPlaceholder = {
  connected: false,
  plannedMetrics: [
    "spend",
    "mer",
    "roas",
    "cpa",
    "cac",
    "contribucionNeta",
  ],
};

function num(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function mapGasAnalyticsSummary(raw: unknown): ErpAnalyticsSummary | null {
  if (!raw || typeof raw !== "object") return null;

  const payload = raw as Record<string, unknown>;
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : payload;

  const totalsRaw =
    data.totals && typeof data.totals === "object"
      ? (data.totals as Record<string, unknown>)
      : null;
  if (!totalsRaw) return null;

  const salesRaw = Array.isArray(data.salesByDay) ? data.salesByDay : [];
  const salesByDay = salesRaw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const date = str(r.date);
      if (!date) return null;
      return {
        date,
        facturacion: num(r.facturacion),
        ordenes: num(r.ordenes),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const topRaw =
    data.topProducts && typeof data.topProducts === "object"
      ? (data.topProducts as Record<string, unknown>)
      : null;

  let topProducts: ErpAnalyticsTopProductsSection;
  if (topRaw && Array.isArray(topRaw.items)) {
    const items = topRaw.items
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        return {
          sku: str(r.sku),
          articulo: str(r.articulo),
          unidades: num(r.unidades),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    topProducts = {
      available: topRaw.available !== false && items.length > 0,
      items,
      unavailableReason: str(topRaw.unavailableReason) || undefined,
    };
  } else if (Array.isArray(data.topProducts)) {
    const items = data.topProducts
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        return {
          sku: str(r.sku),
          articulo: str(r.articulo),
          unidades: num(r.unidades),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    topProducts = {
      available: items.length > 0,
      items,
    };
  } else {
    topProducts = {
      available: false,
      items: [],
      unavailableReason: "Sin datos de productos",
    };
  }

  return {
    totals: {
      facturacionTotal: num(totalsRaw.facturacionTotal),
      netoRealMp: num(totalsRaw.netoRealMp),
      costoTotalMp: num(totalsRaw.costoTotalMp),
      feeMp: num(totalsRaw.feeMp),
      platformFee: num(totalsRaw.platformFee),
      ordenesTotales: num(totalsRaw.ordenesTotales),
      ordenesConMp: num(totalsRaw.ordenesConMp),
      ordenesSinMp: num(totalsRaw.ordenesSinMp),
      prendasVendidas: num(totalsRaw.prendasVendidas),
      ticketPromedio: num(totalsRaw.ticketPromedio),
      netoPromedioPorOrden: num(totalsRaw.netoPromedioPorOrden),
      costoMpPercentPromedio: num(totalsRaw.costoMpPercentPromedio),
    },
    salesByDay,
    topProducts,
    meta: DEFAULT_META,
    analyticsSource: "getAnalyticsSummary",
    remitosInScope: num(data.remitosInScope ?? totalsRaw.ordenesTotales),
  };
}
