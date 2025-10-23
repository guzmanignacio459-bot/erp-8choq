'use client';

import { useState, useEffect, useMemo, useCallback, useRef, ChangeEvent } from "react";
import dayjs from "dayjs";
import RemitoTabs from "./components/RemitoTabs";
import {
  Item,
  Remito,
  Talles,
  useRemitosStore,
} from "@/store/remitos.ts/remitos";
import { formatARS } from "@/lib/format";
import { useProducts } from "@/hooks/useProducts";
import type { ProductRecord } from "@/hooks/useProducts";

type MetodoPago = Exclude<NonNullable<Remito["pago"]>["metodo"], undefined>;

export const EMPLEADOS = ["Agustina", "Candela", "Cecilia", "Florencia", "Valentina"];

export const METODOS_PAGO: MetodoPago[] = [
  "Mercado Pago",
  "Transferencia",
  "Credito",
  "Debito",
  "E-Check",
  "Efectivo",
];

const TALLE_KEYS: (keyof Talles)[] = ["S", "M", "L", "XL", "XXL", "XXXL"];

function numberFromInput(value: string) {
  if (!value.trim()) return 0;
  const normalized = value.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numericValueOrEmpty(value?: number | null) {
  if (!value) return "";
  return String(value);
}

export default function Page() {
  const { remitos, activeId, setActive, addRemito, updateRemito } = useRemitosStore();
  const [data, setData] = useState<Remito[]>([]);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const pdfRef = useRef<HTMLElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const active = useMemo(() => {
    if (!remitos.length) return undefined;
    const found = activeId ? remitos.find((r) => r.remitoId === activeId) : undefined;
    return found ?? remitos[0];
  }, [activeId, remitos]);

  const {
    products,
    suggestions,
    loading: loadingProducts,
    error: productsError,
  } = useProducts();

  const datalistId = useMemo(
    () => `remito-articulos-${active?.remitoId ?? "actual"}`,
    [active?.remitoId]
  );

  const productLookup = useMemo(() => {
    const map = new Map<string, ProductRecord>();
    products.forEach((product) => {
      const keys = [product.name, product.code].filter(Boolean) as string[];
      keys.forEach((key) => map.set(key.toLowerCase(), product));
    });
    return map;
  }, [products]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/remitos/list", { cache: "no-store" });
      const json = await res.json();
      setData(json.remitos || []);
    })();
  }, []);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    if (!text) return data;
    return data.filter((r) =>
      Object.values(r).some((v) => (v || "").toLowerCase().includes(text))
    );
  }, [data, q]);

  useEffect(() => {
    if (!active && remitos.length) {
      setActive(remitos[0].remitoId);
    }
  }, [active, remitos, setActive]);

  const update = useCallback(
    (patch: Partial<Remito>) => {
      if (!active) return;
      updateRemito(active.remitoId, patch);
    },
    [active, updateRemito]
  );

  const updateCliente = useCallback(
    (field: keyof NonNullable<Remito["cliente"]>, value: string) => {
      if (!active) return;
      const cliente = active.cliente ?? { nombre: "", dni: "", provincia: "", localidad: "" };
      update({ cliente: { ...cliente, [field]: value } });
    },
    [active, update]
  );

  const updatePago = useCallback(
    (field: keyof NonNullable<Remito["pago"]>, value: string) => {
      if (!active) return;
      const pago = active.pago ?? {};
      const next = value ? { ...pago, [field]: value } : { ...pago };
      if (!value) delete next[field];
      if (!Object.keys(next).length) update({ pago: undefined });
      else update({ pago: next });
    },
    [active, update]
  );

  const updateItem = useCallback(
    (index: number, patch: Partial<Item>) => {
      if (!active) return;
      const items = active.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
      update({ items });
    },
    [active, update]
  );

  const handleArticuloChange = useCallback(
    (index: number, value: string) => {
      const item = active?.items[index];
      if (!item) return;
      const trimmed = value.trim();
      if (!trimmed) {
        updateItem(index, { articulo: "", codigo: "", precio: 0, totalLinea: 0 });
        return;
      }
      const product = productLookup.get(trimmed.toLowerCase());
      if (!product) {
        updateItem(index, { articulo: value });
        return;
      }
      const patch: Partial<Item> = { articulo: product.name ?? value };
      if (product.code) patch.codigo = product.code;
      if (typeof product.price === "number") {
        patch.precio = product.price;
        patch.totalLinea = (item.cantTotal ?? 0) * product.price;
      }
      updateItem(index, patch);
    },
    [active, productLookup, updateItem]
  );

  const handlePrecioChange = useCallback(
    (index: number, event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      const precio = numberFromInput(value);
      const item = active?.items[index];
      if (!item) return;
      const cantTotal = item.cantTotal ?? 0;
      const totalLinea = cantTotal * precio;
      updateItem(index, { precio, totalLinea });
    },
    [active, updateItem]
  );

  const handleTalleChange = useCallback(
    (index: number, talle: keyof Talles, event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      const qty = numberFromInput(value);
      const item = active?.items[index];
      if (!item) return;
      const talles = { ...(item.talles ?? {}) };
      talles[talle] = qty;
      const cantTotal = TALLE_KEYS.reduce((acc, key) => acc + (talles[key] ?? 0), 0);
      const totalLinea = cantTotal * (item.precio ?? 0);
      updateItem(index, { talles, cantTotal, totalLinea });
    },
    [active, updateItem]
  );

  const subtotal = useMemo(() => active?.items.reduce((acc, item) => acc + (item.totalLinea ?? 0), 0) ?? 0, [active]);
  const descuentos = active?.descuentos ?? 0;
  const envioTotal = active?.envioTotal ?? 0;
  const total = useMemo(() => subtotal - descuentos + envioTotal, [subtotal, descuentos, envioTotal]);

  const onNumberInput = useCallback(
    (field: "descuentos" | "envioTotal") => (event: ChangeEvent<HTMLInputElement>) => {
      const value = numberFromInput(event.target.value);
      update({ [field]: value });
    },
    [update]
  );

  const handleGuardar = useCallback(async () => {
    if (!active) return;
    setSaving(true);
    setSaveStatus("idle");
    setSaveMessage(null);

    const payload = {
      remito: {
        ...active,
        subtotal,
        total,
        descuentos,
        envioTotal,
      },
    };

    try {
      const res = await fetch("/api/remitos/remitos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo guardar el remito");
      setSaveStatus("success");
      setSaveMessage("✅ Remito guardado correctamente");
    } catch (err: any) {
      setSaveStatus("error");
      setSaveMessage(err.message || "Error al guardar el remito");
    } finally {
      setSaving(false);
    }
  }, [active, subtotal, total, descuentos, envioTotal]);

  if (!active) {
    return (
      <>
        <RemitoTabs />
        <main className="max-w-[1220px] mx-auto px-4 py-6">
          <p className="text-neutral-600">No hay remitos abiertos.</p>
        </main>
      </>
    );
  }

  const cliente = active.cliente ?? { nombre: "", dni: "", provincia: "", localidad: "" };
  const pagoMetodo = active.pago?.metodo ?? "";

  return (
    <>
      <RemitoTabs />
      <main ref={pdfRef} className="max-w-[1220px] mx-auto px-4 py-6 space-y-6">
        {/* Encabezado */}
        <section className="bg-white rounded-lg shadow-sm border p-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col text-sm">
              <span className="font-medium">Vendedor</span>
              <select
                value={active.vendedor ?? ""}
                onChange={(e) => update({ vendedor: e.target.value })}
                className="border rounded px-3 py-2"
              >
                <option value="">Seleccionar</option>
                {EMPLEADOS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-sm">
              <span className="font-medium">Método de pago</span>
              <select
                value={pagoMetodo}
                onChange={(e) => updatePago("metodo", e.target.value)}
                className="border rounded px-3 py-2"
              >
                <option value="">Seleccionar</option>
                {METODOS_PAGO.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* Datos del cliente */}
        <section className="bg-white rounded-lg shadow-sm border p-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col text-sm">
            <span className="font-medium">Nombre</span>
            <input
              value={cliente.nombre}
              onChange={(e) => updateCliente("nombre", e.target.value)}
              className="border rounded px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="font-medium">DNI</span>
            <input
              value={cliente.dni}
              onChange={(e) => updateCliente("dni", e.target.value)}
              className="border rounded px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="font-medium">Provincia</span>
            <input
              value={cliente.provincia}
              onChange={(e) => updateCliente("provincia", e.target.value)}
              className="border rounded px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="font-medium">Localidad</span>
            <input
              value={cliente.localidad}
              onChange={(e) => updateCliente("localidad", e.target.value)}
              className="border rounded px-3 py-2"
            />
          </label>
        </section>

        {/* Totales */}
        <section className="bg-white rounded-lg shadow-sm border p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <span>{formatARS(subtotal)}</span>
          </div>
          <label className="flex justify-between text-sm">
            <span>Descuentos</span>
            <input
              type="number"
              step="0.01"
              value={numericValueOrEmpty(descuentos)}
              onChange={onNumberInput("descuentos")}
              className="border rounded px-2 py-1 w-28 text-right"
            />
          </label>
          <label className="flex justify-between text-sm">
            <span>Envío</span>
            <input
              type="number"
              step="0.01"
              value={numericValueOrEmpty(envioTotal)}
              onChange={onNumberInput("envioTotal")}
              className="border rounded px-2 py-1 w-28 text-right"
            />
          </label>
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>{formatARS(total)}</span>
          </div>
          <button
            onClick={handleGuardar}
            disabled={saving}
            className="w-full bg-black text-white rounded py-2 disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar Remito"}
          </button>
          {saveStatus === "success" && <p className="text-green-600 text-sm">{saveMessage}</p>}
          {saveStatus === "error" && <p className="text-red-600 text-sm">{saveMessage}</p>}
        </section>
      </main>
    </>
  );
}
