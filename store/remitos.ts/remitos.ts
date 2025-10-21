"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Talles = Partial<Record<"S" | "M" | "L" | "XL" | "XXL" | "XXXL", number>>;

export type Item = {
  codigo: string;
  articulo: string;
  precio: number;
  cantTotal: number;
  totalLinea: number;
  talles?: Talles;
};

export type Remito = {
  remitoId: string;
  fecha: string; // YYYY-MM-DD
  mayorista: boolean;
  cliente?: { nombre: string; dni?: string; provincia?: string; localidad?: string };
  vendedor?: string;
  envio?: { metodo?: string; costo?: number };
  pago?: { metodo?: "Mercado Pago" | "Transferencia" | "Credito" | "Debito" | "E-Check" | "Efectivo" };
  items: Item[];
  subtotal?: number;
  descuentos?: number;
  envioTotal?: number;
  total?: number;
  observaciones?: string;
  nombreHoja?: string; // nombre visible en la pestaña
  pagado?: boolean;    // estado de la pestaña
};

function nuevoId() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `R-${n}`;
}

function plantillaVacia(): Remito {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  const dd = String(hoy.getDate()).padStart(2, "0");
  return {
    remitoId: nuevoId(),
    fecha: `${yyyy}-${mm}-${dd}`,
    mayorista: false,
    cliente: { nombre: "" },
    items: Array.from({ length: 10 }).map(() => ({
      codigo: "",
      articulo: "",
      precio: 0,
      cantTotal: 0,
      totalLinea: 0,
      talles: { S: 0, M: 0, L: 0, XL: 0, XXL: 0, XXXL: 0 },
    })),
    subtotal: 0,
    descuentos: 0,
    envioTotal: 0,
    total: 0,
    observaciones: "",
    nombreHoja: "",
    pagado: false,
  };
}

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
        set({ remitos: filtered.length ? filtered : [plantillaVacia()], activeId: newActive });
      },
      updateRemito: (id, patch) => {
        set({
          remitos: get().remitos.map((r) => (r.remitoId === id ? { ...r, ...patch } : r)),
        });
      },
      markPagado: (id, val) => {
        set({
          remitos: get().remitos.map((r) => (r.remitoId === id ? { ...r, pagado: val } : r)),
        });
      },
    }),
    { name: "8choq-remitos" }
  )
);
