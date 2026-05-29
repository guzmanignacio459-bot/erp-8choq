/**
 * Agrega métricas Analytics desde remitos mapeados (listRemitosFull).
 * Solo lectura — no recalcula reglas internas ni netos por prenda.
 */

import {
  artCalendarDayKey,
  artRangeBoundsMs,
  parseArtInstantMs,
} from "@/lib/erp/art-date";
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

/** Instant de columna Fecha (ISO) — nunca fechaDisplay de presentación. */
function remitoInstantMs(remito: ErpRemito): number | null {
  const raw = remito.fechaRaw?.trim();
  if (!raw) return null;
  return parseArtInstantMs(raw);
}

function remitoDateKey(remito: ErpRemito): string | null {
  const ms = remitoInstantMs(remito);
  if (ms == null) return null;
  try {
    return artCalendarDayKey(ms);
  } catch {
    return null;
  }
}

/** Filtra remitos por rango calendario ART YYYY-MM-DD (opcional). */
export function filterRemitosForAnalytics(
  remitos: ErpRemito[],
  from?: string,
  to?: string
): ErpRemito[] {
  const fromTrim = from?.trim();
  const toTrim = to?.trim();
  if (!fromTrim && !toTrim) return remitos;

  const bounds =
    fromTrim && toTrim
      ? artRangeBoundsMs(fromTrim, toTrim)
      : fromTrim
        ? artRangeBoundsMs(fromTrim, fromTrim)
        : toTrim
          ? artRangeBoundsMs(toTrim, toTrim)
          : null;

  if (!bounds) return [];

  const { startMs: rangeStartMs, endMs: rangeEndMs } = bounds;

  return remitos.filter((r) => {
    const ms = remitoInstantMs(r);
    if (ms == null) return false;
    return ms >= rangeStartMs && ms <= rangeEndMs;
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
