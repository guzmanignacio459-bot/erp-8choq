/**
 * Agrega métricas Analytics desde remitos mapeados (listRemitosFull).
 * Solo lectura — no recalcula reglas internas ni netos por prenda.
 */

import { parseRemitoFecha } from "@/lib/erp/remitos-date";
import {
  hasMercadoPagoApplied,
  parseRemitoAmount,
  parseRemitoInteger,
} from "@/lib/erp/remitos-kpis";
import type {
  ErpAnalyticsMetaPlaceholder,
  ErpAnalyticsSummary,
  ErpAnalyticsSource,
  ErpAnalyticsTopProductsSection,
  ErpRemito,
} from "@/types/erp";

const META_PLACEHOLDER: ErpAnalyticsMetaPlaceholder = {
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

const TOP_PRODUCTS_UNAVAILABLE: ErpAnalyticsTopProductsSection = {
  available: false,
  items: [],
  unavailableReason:
    "Top productos requiere getAnalyticsSummary (REMITO_ITEMS). Disponible tras deploy GAS.",
};

function remitoDateKey(remito: ErpRemito): string | null {
  const raw = remito.fechaRaw || remito.fechaDisplay;
  const d = parseRemitoFecha(raw);
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDayFromIso(iso: string): Date | null {
  const d = parseRemitoFecha(iso) ?? new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDayFromIso(iso: string): Date | null {
  const d = parseRemitoFecha(iso) ?? new Date(`${iso}T23:59:59`);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Filtra remitos por rango ISO YYYY-MM-DD (opcional) */
export function filterRemitosForAnalytics(
  remitos: ErpRemito[],
  from?: string,
  to?: string
): ErpRemito[] {
  const fromTrim = from?.trim();
  const toTrim = to?.trim();
  if (!fromTrim && !toTrim) return remitos;

  const rangeStart = fromTrim ? startOfDayFromIso(fromTrim) : new Date(0);
  const rangeEnd = toTrim ? endOfDayFromIso(toTrim) : new Date(8640000000000000);

  if (!rangeStart || !rangeEnd) return remitos;

  return remitos.filter((r) => {
    const d = parseRemitoFecha(r.fechaRaw || r.fechaDisplay);
    if (!d) return false;
    return (
      d.getTime() >= rangeStart.getTime() && d.getTime() <= rangeEnd.getTime()
    );
  });
}

/** Agrega analytics desde filas REMITOS ya mapeadas */
export function aggregateAnalyticsFromRemitos(
  remitos: ErpRemito[],
  options?: { analyticsSource?: ErpAnalyticsSource }
): ErpAnalyticsSummary {
  let facturacionTotal = 0;
  let netoRealMp = 0;
  let costoTotalMp = 0;
  let feeMp = 0;
  let platformFee = 0;
  let mpTransactionAmountTotal = 0;
  let prendasVendidas = 0;
  let ordenesConMp = 0;

  const dayMap = new Map<string, { facturacion: number; ordenes: number }>();

  for (const r of remitos) {
    const totalFinal = parseRemitoAmount(r.totalFinal);
    facturacionTotal += totalFinal;
    netoRealMp += parseRemitoAmount(r.mpNetoRealOrden);
    costoTotalMp += parseRemitoAmount(r.mpTotalCostReal);
    feeMp += parseRemitoAmount(r.mpFeeTotalReal);
    platformFee += parseRemitoAmount(r.mpPlatformFeeTotalReal);
    mpTransactionAmountTotal += parseRemitoAmount(r.mpTransactionAmount);
    prendasVendidas += parseRemitoInteger(r.totalPrendas);

    if (hasMercadoPagoApplied(r)) ordenesConMp += 1;

    const dateKey = remitoDateKey(r);
    if (dateKey) {
      const entry = dayMap.get(dateKey) ?? { facturacion: 0, ordenes: 0 };
      entry.facturacion += totalFinal;
      entry.ordenes += 1;
      dayMap.set(dateKey, entry);
    }
  }

  const ordenesTotales = remitos.length;
  const ordenesSinMp = Math.max(0, ordenesTotales - ordenesConMp);

  const ticketPromedio =
    ordenesTotales > 0 ? facturacionTotal / ordenesTotales : 0;
  const netoPromedioPorOrden =
    ordenesConMp > 0 ? netoRealMp / ordenesConMp : 0;
  const costoMpPercentPromedio =
    mpTransactionAmountTotal > 0
      ? (costoTotalMp / mpTransactionAmountTotal) * 100
      : 0;

  const salesByDay = Array.from(dayMap.entries())
    .map(([date, v]) => ({
      date,
      facturacion: v.facturacion,
      ordenes: v.ordenes,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    totals: {
      facturacionTotal,
      netoRealMp,
      costoTotalMp,
      feeMp,
      platformFee,
      ordenesTotales,
      ordenesConMp,
      ordenesSinMp,
      prendasVendidas,
      ticketPromedio,
      netoPromedioPorOrden,
      costoMpPercentPromedio,
    },
    salesByDay,
    topProducts: TOP_PRODUCTS_UNAVAILABLE,
    meta: META_PLACEHOLDER,
    analyticsSource:
      options?.analyticsSource ?? "listRemitosFull-fallback",
    remitosInScope: remitos.length,
  };
}
