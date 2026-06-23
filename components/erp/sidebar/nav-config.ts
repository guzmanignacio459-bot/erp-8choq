import type { ErpNavSection } from "@/types/erp";

export const ERP_NAV_SECTIONS: ErpNavSection[] = [
  {
    id: "principal",
    title: "Principal",
    items: [
      {
        id: "overview",
        label: "Overview",
        href: "/dashboard",
        icon: "layout-dashboard",
      },
      {
        id: "orders-tn",
        label: "Órdenes TN",
        href: "/dashboard/orders",
        icon: "shopping-bag",
        badge: "V2",
      },
      {
        id: "ventas",
        label: "Ventas",
        href: "/dashboard/ventas",
        icon: "trending-up",
      },
      {
        id: "analytics",
        label: "Analytics",
        href: "/dashboard/analytics",
        icon: "bar-chart-3",
      },
    ],
  },
  {
    id: "operaciones",
    title: "Operaciones",
    items: [
      {
        id: "importaciones",
        label: "Importaciones",
        href: "/dashboard/importaciones",
        icon: "download",
      },
      {
        id: "remitos-erp",
        label: "Remitos",
        href: "/dashboard/remitos",
        icon: "files",
      },
      {
        id: "remito-items",
        label: "Ítems de remito",
        href: "/dashboard/remito-items",
        icon: "list-tree",
      },
      {
        id: "productos",
        label: "Productos",
        href: "/dashboard/productos",
        icon: "box",
      },
      {
        id: "stock",
        label: "Stock",
        href: "/dashboard/stock",
        icon: "package",
      },
      {
        id: "remitos-live",
        label: "Remitos (prod.)",
        href: "/remitos",
        icon: "file-text",
        badge: "Live",
      },
    ],
  },
  {
    id: "finanzas",
    title: "Finanzas",
    items: [
      {
        id: "mercadopago",
        label: "Mercado Pago",
        href: "/dashboard/mercado-pago",
        icon: "credit-card",
      },
    ],
  },
  {
    id: "comercial",
    title: "Comercial",
    items: [
      {
        id: "clientes",
        label: "Clientes",
        href: "/dashboard/clientes",
        icon: "users",
      },
    ],
  },
  {
    id: "sistema",
    title: "Sistema",
    items: [
      {
        id: "system",
        label: "Sistema",
        href: "/dashboard/system",
        icon: "activity",
        badge: "V2",
      },
      {
        id: "config",
        label: "Configuración",
        href: "/dashboard/configuracion",
        icon: "settings",
      },
    ],
  },
];
