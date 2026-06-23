import type { ErpRemitoDisplayRow } from "@/types/erp-remitos-display";

export type NeonCommercialKpis = {
  ventasTn: number;
  facturacionTn: number;
  ticketPromedioTn: number;
};

export type NeonOperationalKpis = {
  remitosErp: number;
  prendas: number;
  ticketsConMp: number;
  netoMp: number;
  hasNetoMp: boolean;
};

export type NeonLayeredKpis = {
  commercial: NeonCommercialKpis;
  operational: NeonOperationalKpis;
};

/**
 * KPIs Neon — capas separadas.
 * Comercial: tn_orders (tn_total, grain tn_created_at del listado).
 * Operativo: erp_orders vinculados (prendas, MP, neto) — sin mezclar fechas.
 */
export function computeNeonLayeredKpis(
  rows: ErpRemitoDisplayRow[]
): NeonLayeredKpis {
  let facturacionTn = 0;
  let remitosErp = 0;
  let prendas = 0;
  let ticketsConMp = 0;
  let netoMp = 0;

  for (const row of rows) {
    const meta = row.neonMeta;
    if (!meta) continue;

    facturacionTn += meta.tnTotal;

    const op = meta.operational;
    if (!meta.hasErpRemito || !op) continue;

    remitosErp += 1;
    prendas += op.totalPrendas;
    if (op.hasMercadoPago) {
      ticketsConMp += 1;
      if (op.netoOperativo != null && Number.isFinite(op.netoOperativo)) {
        netoMp += op.netoOperativo;
      }
    }
  }

  const ventasTn = rows.length;

  return {
    commercial: {
      ventasTn,
      facturacionTn,
      ticketPromedioTn: ventasTn > 0 ? facturacionTn / ventasTn : 0,
    },
    operational: {
      remitosErp,
      prendas,
      ticketsConMp,
      netoMp,
      hasNetoMp: netoMp > 0,
    },
  };
}
