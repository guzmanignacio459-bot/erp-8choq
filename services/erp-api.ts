/**
 * Servicio API base del ERP 8Q — Fase 1
 * Solo datos mock. No llama endpoints de producción.
 */

import type { ErpApiResponse, ErpDashboardOverview } from "@/types/erp";

const MOCK_DELAY_MS = 0;

function mockDelay(): Promise<void> {
  if (MOCK_DELAY_MS <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
}

function formatARS(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);
}

function buildMockOverview(): ErpDashboardOverview {
  const now = new Date();
  return {
    periodo: "Últimos 30 días",
    actualizadoEn: now.toISOString(),
    kpis: [
      {
        key: "ventasTotales",
        label: "Ventas Totales",
        value: formatARS(4_872_400),
        rawValue: 4_872_400,
        change: "+12.4%",
        trend: "up",
        hint: "GMV acumulado Tiendanube + manual",
        accent: "violet",
      },
      {
        key: "remitos",
        label: "Remitos",
        value: "186",
        rawValue: 186,
        change: "+8",
        trend: "up",
        hint: "Emitidos en el período",
        accent: "cyan",
      },
      {
        key: "ordenesImportadas",
        label: "Órdenes Importadas",
        value: "142",
        rawValue: 142,
        change: "+23",
        trend: "up",
        hint: "Desde Tiendanube (paid)",
        accent: "blue",
      },
      {
        key: "netoReal",
        label: "Neto Real",
        value: formatARS(3_914_200),
        rawValue: 3_914_200,
        change: "+9.1%",
        trend: "up",
        hint: "Después de envíos y descuentos",
        accent: "emerald",
      },
      {
        key: "stockBajo",
        label: "Stock Bajo",
        value: "17",
        rawValue: 17,
        change: "+3",
        trend: "down",
        hint: "SKUs bajo umbral en Sheets",
        accent: "amber",
      },
      {
        key: "pendientes",
        label: "Pendientes",
        value: "24",
        rawValue: 24,
        change: "-5",
        trend: "up",
        hint: "Remitos / órdenes sin cerrar",
        accent: "orange",
      },
      {
        key: "mercadoPago",
        label: "Mercado Pago",
        value: formatARS(1_240_800),
        rawValue: 1_240_800,
        change: "+6.8%",
        trend: "up",
        hint: "Cobros conciliados (mock)",
        accent: "pink",
      },
      {
        key: "conversion",
        label: "Conversión",
        value: "3.8%",
        rawValue: 3.8,
        change: "+0.4pp",
        trend: "up",
        hint: "Checkout → pago confirmado",
        accent: "rose",
      },
    ],
    ordenesRecientes: [
      {
        id: "TN-98421",
        canal: "Tiendanube",
        cliente: "María González",
        monto: 89_500,
        estado: "Importado",
        fecha: "2026-05-27T14:22:00Z",
      },
      {
        id: "TN-98418",
        canal: "Tiendanube",
        cliente: "Lucas Pérez",
        monto: 124_000,
        estado: "Pagado",
        fecha: "2026-05-27T13:05:00Z",
      },
      {
        id: "MP-772901",
        canal: "Mercado Pago",
        cliente: "Ana Ruiz",
        monto: 67_200,
        estado: "Conciliado",
        fecha: "2026-05-27T11:48:00Z",
      },
      {
        id: "R-482910",
        canal: "Manual",
        cliente: "Distribuidor Norte",
        monto: 312_000,
        estado: "Pendiente",
        fecha: "2026-05-27T10:15:00Z",
      },
      {
        id: "TN-98402",
        canal: "Tiendanube",
        cliente: "Sofía Martín",
        monto: 45_800,
        estado: "Importado",
        fecha: "2026-05-26T18:30:00Z",
      },
    ],
    actividad: [
      {
        id: "act-1",
        tipo: "import",
        titulo: "Import batch Tiendanube",
        descripcion: "42 órdenes procesadas (dry-run: false)",
        timestamp: "2026-05-27T09:00:00Z",
      },
      {
        id: "act-2",
        tipo: "remito",
        titulo: "Remito R-482901 guardado",
        descripcion: "Apps Script · mayorista",
        timestamp: "2026-05-27T08:42:00Z",
      },
      {
        id: "act-3",
        tipo: "stock",
        titulo: "Alerta stock bajo",
        descripcion: "3 SKUs en STOCK MAESTRO",
        timestamp: "2026-05-27T07:10:00Z",
      },
      {
        id: "act-4",
        tipo: "pago",
        titulo: "Pago MP conciliado",
        descripcion: "Orden TN-98388",
        timestamp: "2026-05-26T22:18:00Z",
      },
    ],
    resumen: {
      ordenesHoy: 28,
      remitosAbiertos: 12,
      alertasStock: 17,
      tasaConciliacion: 94.2,
    },
  };
}

/** Overview del dashboard — mock, listo para reemplazar por fetch real en fases posteriores */
export async function getDashboardOverview(): Promise<
  ErpApiResponse<ErpDashboardOverview>
> {
  await mockDelay();
  return {
    ok: true,
    data: buildMockOverview(),
    source: "mock",
    fetchedAt: new Date().toISOString(),
  };
}

/** Healthcheck del módulo ERP (sin tocar APIs de producción) */
export async function getErpHealth(): Promise<
  ErpApiResponse<{ status: "ok"; module: "erp-dashboard"; phase: 1 }>
> {
  await mockDelay();
  return {
    ok: true,
    data: { status: "ok", module: "erp-dashboard", phase: 1 },
    source: "mock",
    fetchedAt: new Date().toISOString(),
  };
}
