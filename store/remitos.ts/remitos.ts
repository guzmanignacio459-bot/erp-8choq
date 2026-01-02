"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** ===== Tipos ===== */
export type Talles = Partial<
  Record<"S" | "M" | "L" | "XL" | "XXL" | "XXXL", number>
>;

export type Item = {
  codigo: string;
  articulo: string;
  precio?: number;      // opcional → evita mostrar 0 en inputs
  cantTotal?: number;   // opcional
  totalLinea?: number;  // opcional
  talles?: Talles;      // puede venir vacío
};

export type Remito = {
  remitoId: string;
  fecha: string;              // YYYY-MM-DD
  mayorista: boolean;         // requerido
  cliente?: {
    nombre: string;
    dni?: string;
    provincia?: string;
    localidad?: string;
  };
  vendedor?: string;
  envio?: { metodo?: string; costo?: number };
  recargoPct?: number;        // 0 | 5 | 8 | 15
  recargoMonto?: number;      // calculado y persistido
  pago?: {
    metodo?:
      | "Mercado Pago 1"
      | "Mercado Pago 2"
      | "Mercado Pago 3"
      | "Transferencia 1"
      | "Transferencia 2"
      | "Debito"
      | "E-Check"
      | "Efectivo";
  };
  items: Item[];
  subtotal?: number;
  descuentos?: number;
  envioTotal?: number;
  total?: number;
  observaciones?: string;
  nombreHoja?: string;
  pagado?: boolean;
};

/** ===== Helpers ===== */
function nuevoId() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `R-${n}`;
}

/**
 * Plantilla vacía para crear nuevos remitos
 * (sin valores numéricos por defecto → no muestra 0 en inputs)
 */
function plantillaVacia(): Remito {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  const dd = String(hoy.getDate()).padStart(2, "0");

  const itemVacio: Item = {
    codigo: "",
    articulo: "",
    precio: undefined,
    cantTotal: undefined,
    totalLinea: undefined,
    talles: {},
  };

  return {
    remitoId: nuevoId(),
    fecha: `${yyyy}-${mm}-${dd}`,
    mayorista: false, // <- requerido por el tipo

    cliente: {
      nombre: "",
      dni: "",
      provincia: "",
      localidad: "",
    },

    vendedor: "",
    pago: {},

    observaciones: "",
    items: Array.from({ length: 10 }, () => ({ ...itemVacio })),

    // totales (pueden empezar en 0 sin problema)
    subtotal: 0,
    descuentos: 0,
    total: 0,

    // envío y recargos (shape preparado; podés dejar costo sin setear si querés ocultar 0)
    envio: { metodo: "", costo: 0 },
    recargoPct: 0,
    recargoMonto: 0,
  };
}

/** ===== Store ===== */
type State = {
  remitos: Remito[];
  activeId?: string;
  setActive: (id: string) => void;
  addRemito: () => void;
  closeRemito: (id: string) => void;
  updateRemito: (id: string, patch: Partial<Remito>) => void;
  markPagado: (id: string, val: boolean) => void;
};

export const useRemitosStore = create<State>()(
  persist(
    (set, get) => ({
      remitos: [plantillaVacia()],
      activeId: undefined,

      setActive: (id) => set({ activeId: id }),

      addRemito: () => {
        const r = plantillaVacia();
        const current = get().remitos;
        set({ remitos: [...current, r], activeId: r.remitoId });
      },

      closeRemito: (id) => {
        const filtered = get().remitos.filter((r) => r.remitoId !== id);
        const newActive = filtered[filtered.length - 1]?.remitoId;
        set({
          remitos: filtered.length ? filtered : [plantillaVacia()],
          activeId: newActive,
        });
      },

      updateRemito: (id, patch) => {
        set({
          remitos: get().remitos.map((r) =>
            r.remitoId === id ? { ...r, ...patch } : r
          ),
        });
      },

      markPagado: (id, val) => {
        set({
          remitos: get().remitos.map((r) =>
            r.remitoId === id ? { ...r, pagado: val } : r
          ),
        });
      },
    }),
    { name: "8choq-remitos" }
  )
);
