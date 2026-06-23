/**
 * Filas del dashboard remitos — GAS legacy + extensión Neon TN-led (L2.2)
 */

import type { ErpRemito } from "@/types/erp";
import type { TnCommercialStatus } from "@/types/erp-v2-api";
import type { TnErpReconciliationStatus } from "@/types/erp-v2-db";

export type RemitosDataSource = "gas" | "neon";

export type ErpRemitoNeonOperationalMeta = {
  fechaErp: string | null;
  totalFinalErp: number;
  totalPrendas: number;
  netoOperativo: number | null;
  hasMercadoPago: boolean;
};

export type ErpRemitoNeonMeta = {
  commercialStatus: TnCommercialStatus;
  reconciliationStatus: TnErpReconciliationStatus | null;
  hasErpRemito: boolean;
  tnOnlyPendingErp: boolean;
  erpOrderId: string | null;
  /** Capa A — tn_orders */
  tnTotal: number;
  tnCreatedAt: string | null;
  /** Capa B — erp_orders (solo si hay remito) */
  operational: ErpRemitoNeonOperationalMeta | null;
};

/** Fila compatible con tabla/KPI GAS + metadatos Neon opcionales */
export type ErpRemitoDisplayRow = ErpRemito & {
  neonMeta?: ErpRemitoNeonMeta;
};
