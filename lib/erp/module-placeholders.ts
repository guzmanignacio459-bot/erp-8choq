import type { ErpModulePageConfig } from "@/types/erp";

export const ERP_MODULE_PLACEHOLDERS: Record<string, ErpModulePageConfig> = {
  ventas: {
    slug: "ventas",
    title: "Ventas",
    description:
      "Consolidado de ventas por canal (Tiendanube, manual y futuros marketplaces). GMV, ticket promedio y tendencias sin alterar la lógica financiera de importación.",
    status: "in-preparation",
    statusLabel: "Módulo en preparación",
    integrations: ["Tiendanube", "Google Sheets", "Apps Script"],
    mockStats: [
      { label: "GMV período", value: "$4.87M", hint: "Mock · 30 días" },
      { label: "Ticket promedio", value: "$34.200", hint: "Mock" },
      { label: "Órdenes pagadas", value: "142", hint: "TN + manual" },
      { label: "Crecimiento", value: "+12.4%", hint: "vs período anterior" },
    ],
    plannedFeatures: [
      "Desglose por canal y método de pago",
      "Comparativa diaria / semanal / mensual",
      "Exportación CSV para contabilidad",
      "Filtros por vendedor y condición de compra",
    ],
  },
  remitos: {
    slug: "remitos",
    title: "Remitos ERP",
    description:
      "Vista unificada de remitos dentro del ERP. El flujo operativo en producción sigue en /remitos — este módulo será el panel de gestión avanzada.",
    status: "in-preparation",
    statusLabel: "Módulo en preparación",
    integrations: ["Apps Script", "Google Sheets"],
    mockStats: [
      { label: "Remitos período", value: "186", hint: "Mock" },
      { label: "Abiertos", value: "12", hint: "Sin cerrar" },
      { label: "Mayoristas", value: "34%", hint: "Mix mock" },
      { label: "Tiempo medio", value: "2.1 días", hint: "Emisión → pago" },
    ],
    plannedFeatures: [
      "Listado avanzado con filtros",
      "Estados y auditoría de cambios",
      "Vinculación orden TN → remito",
      "Acceso rápido al editor en producción",
    ],
  },
  "remito-items": {
    slug: "remito-items",
    title: "Ítems de remito",
    description:
      "Detalle granular por línea: SKU, talle, owner (8Q / SCNL), precios netos y cantidades. Base para conciliación stock–ventas.",
    status: "coming-soon",
    statusLabel: "Próximamente",
    integrations: ["Apps Script", "STOCK MAESTRO"],
    mockStats: [
      { label: "Líneas período", value: "1.240", hint: "Mock" },
      { label: "SKUs únicos", value: "318", hint: "Mock" },
      { label: "Con -SCNL", value: "18%", hint: "Owner SCNL" },
      { label: "Desc. promedio", value: "6.2%", hint: "Por línea" },
    ],
    plannedFeatures: [
      "Explorador por remito y por SKU",
      "Margen estimado por prenda",
      "Alertas de inconsistencia SKU/talle",
      "Bulk edit (futuro, con permisos)",
    ],
  },
  productos: {
    slug: "productos",
    title: "Productos",
    description:
      "Catálogo maestro alineado con Sheets y Tiendanube: códigos, artículos, precios lista y variantes por talle.",
    status: "in-preparation",
    statusLabel: "Módulo en preparación",
    integrations: ["Google Sheets", "Tiendanube"],
    mockStats: [
      { label: "Productos activos", value: "412", hint: "Mock" },
      { label: "Con stock", value: "389", hint: "Mock" },
      { label: "Sin precio", value: "7", hint: "Revisión" },
      { label: "Variantes", value: "2.060", hint: "Por talle" },
    ],
    plannedFeatures: [
      "Sincronización catálogo TN ↔ Sheets",
      "Historial de precios",
      "Búsqueda por SKU / artículo",
      "Etiquetas y colecciones",
    ],
  },
  stock: {
    slug: "stock",
    title: "Stock",
    description:
      "Monitoreo de STOCK MAESTRO: disponibilidad por SKU/talle, umbrales bajos y proyección de quiebres.",
    status: "in-preparation",
    statusLabel: "Módulo en preparación",
    integrations: ["Google Sheets", "Apps Script"],
    mockStats: [
      { label: "SKUs bajo umbral", value: "17", hint: "Mock alertas" },
      { label: "Unidades totales", value: "8.420", hint: "Mock" },
      { label: "Reservado", value: "214", hint: "Órdenes abiertas" },
      { label: "Cobertura media", value: "18 días", hint: "Estimado" },
    ],
    plannedFeatures: [
      "Mapa de calor por talle",
      "Alertas configurables",
      "Movimientos entrada/salida",
      "Integración con remitos emitidos",
    ],
  },
  "mercado-pago": {
    slug: "mercado-pago",
    title: "Mercado Pago",
    description:
      "Panel de cobros, liquidaciones y estado de conciliación con órdenes Tiendanube. No reemplaza /api/mercadopago/import-payment.",
    status: "coming-soon",
    statusLabel: "Próximamente",
    integrations: ["Mercado Pago", "Tiendanube", "Apps Script"],
    mockStats: [
      { label: "Cobrado período", value: "$1.24M", hint: "Mock" },
      { label: "Pendiente conciliar", value: "8", hint: "Mock" },
      { label: "Tasa conciliación", value: "94.2%", hint: "Mock" },
      { label: "Comisiones est.", value: "$62K", hint: "Mock" },
    ],
    plannedFeatures: [
      "Listado de pagos importados",
      "Match automático orden ↔ pago",
      "Disputas y devoluciones",
      "Reporte neto por cuenta MP",
    ],
  },
  analytics: {
    slug: "analytics",
    title: "Analytics",
    description:
      "Métricas avanzadas: conversión, cohortes, rendimiento por producto y canal. Gráficos interactivos en fases posteriores.",
    status: "coming-soon",
    statusLabel: "Próximamente",
    integrations: ["Tiendanube", "Mercado Pago", "Apps Script"],
    mockStats: [
      { label: "Conversión", value: "3.8%", hint: "Mock" },
      { label: "Retorno clientes", value: "22%", hint: "Mock" },
      { label: "Top categoría", value: "Remeras", hint: "Mock" },
      { label: "ROAS est.", value: "4.2x", hint: "Ads futuro" },
    ],
    plannedFeatures: [
      "Dashboards personalizables",
      "Embudo checkout → pago",
      "Ranking productos y vendedores",
      "Exportación programada",
    ],
  },
  clientes: {
    slug: "clientes",
    title: "Clientes",
    description:
      "CRM ligero: historial de compras, datos de contacto y segmentación para mayoristas y retail.",
    status: "in-preparation",
    statusLabel: "Módulo en preparación",
    integrations: ["Tiendanube", "Apps Script"],
    mockStats: [
      { label: "Clientes únicos", value: "2.840", hint: "Mock" },
      { label: "Recurrentes", value: "31%", hint: "Mock" },
      { label: "Mayoristas", value: "48", hint: "Activos" },
      { label: "LTV promedio", value: "$128K", hint: "Mock ARS" },
    ],
    plannedFeatures: [
      "Ficha cliente unificada",
      "Historial remitos y órdenes",
      "Etiquetas y segmentos",
      "Exportación para campañas",
    ],
  },
  configuracion: {
    slug: "configuracion",
    title: "Configuración",
    description:
      "Parámetros del ERP: integraciones, tokens (solo servidor), umbrales de stock y preferencias de visualización.",
    status: "in-preparation",
    statusLabel: "Módulo en preparación",
    integrations: ["Vercel", "Apps Script", "Tiendanube", "Mercado Pago"],
    mockStats: [
      { label: "Integraciones", value: "4", hint: "Conectadas prod" },
      { label: "Webhooks activos", value: "2", hint: "TN + GAS" },
      { label: "Usuarios", value: "—", hint: "Auth Fase 3" },
      { label: "Entorno", value: "Prod", hint: "Vercel" },
    ],
    plannedFeatures: [
      "Gestión de credenciales (server-only)",
      "Umbrales stock y alertas",
      "Logs de importación",
      "Preferencias dashboard y moneda",
    ],
  },
};

export function getModulePlaceholder(slug: keyof typeof ERP_MODULE_PLACEHOLDERS) {
  return ERP_MODULE_PLACEHOLDERS[slug];
}
