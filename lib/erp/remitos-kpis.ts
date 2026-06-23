import type { ErpRemito } from "@/types/erp";

export type RemitosKpiMetrics = {
  totalRemitos: number;
  facturacionTotal: number;
  prendasVendidas: number;
  ticketsConMp: number;
};

/** Parsea montos de sheet/GAS solo para sumar en UI — no recalcula netos */
export function parseRemitoAmount(value: string | undefined): number {
  if (!value?.trim()) return 0;
  const trimmed = value.trim();

  if (trimmed.includes(",")) {
    const normalized = trimmed.replace(/\./g, "").replace(",", ".");
    const n = Number.parseFloat(normalized.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  const n = Number.parseFloat(trimmed.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function parseRemitoInteger(value: string | undefined): number {
  if (!value?.trim()) return 0;
  const n = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

export function hasMercadoPagoApplied(remito: ErpRemito): boolean {
  return Boolean(
    remito.mpPaymentId?.trim() ||
      remito.mpStatus?.trim() ||
      remito.mpNetoRealOrden?.trim() ||
      remito.mpTotalCostReal?.trim()
  );
}

export function computeRemitosKpis(remitos: ErpRemito[]): RemitosKpiMetrics {
  let facturacionTotal = 0;
  let prendasVendidas = 0;
  let ticketsConMp = 0;

  for (const r of remitos) {
    facturacionTotal += parseRemitoAmount(r.totalFinal);
    prendasVendidas += parseRemitoInteger(r.totalPrendas);
    if (hasMercadoPagoApplied(r)) ticketsConMp += 1;
  }

  return {
    totalRemitos: remitos.length,
    facturacionTotal,
    prendasVendidas,
    ticketsConMp,
  };
}

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function formatRemitosCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

export function formatRemitosCount(value: number): string {
  return new Intl.NumberFormat("es-AR").format(value);
}
