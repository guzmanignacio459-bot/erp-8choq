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
  return value && value !== 0 ? String(value) : "";
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

  // Listado de remitos (tabla resumen)
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
    if (!active && remitos.length) setActive(remitos[0].remitoId);
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
        updateItem(index, { articulo: "", codigo: "", precio: undefined, totalLinea: undefined, cantTotal: undefined, talles: {} });
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
        const cant = item.cantTotal ?? 0;
        patch.precio = product.price;
        patch.totalLinea = cant > 0 ? cant * product.price : undefined;
      }
      updateItem(index, patch);
    },
    [active, productLookup, updateItem]
  );

  const handlePrecioChange = useCallback(
    (index: number, event: ChangeEvent<HTMLInputElement>) => {
      const precio = numberFromInput(event.target.value);
      const item = active?.items[index];
      if (!item) return;
      const cantTotal = item.cantTotal ?? 0;
      updateItem(index, {
        precio: precio || undefined,
        totalLinea: cantTotal > 0 && precio > 0 ? cantTotal * precio : undefined,
      });
    },
    [active, updateItem]
  );

  const handleTalleChange = useCallback(
    (index: number, talle: keyof Talles, event: ChangeEvent<HTMLInputElement>) => {
      const qty = numberFromInput(event.target.value);
      const item = active?.items[index];
      if (!item) return;
      const talles = { ...(item.talles ?? {}) };
      if (qty > 0) talles[talle] = qty;
      else delete talles[talle];
      const cantTotal = TALLE_KEYS.reduce((acc, key) => acc + (talles[key] ?? 0), 0);
      const totalLinea = cantTotal > 0 && (item.precio ?? 0) > 0 ? cantTotal * (item.precio as number) : undefined;
      updateItem(index, { talles, cantTotal: cantTotal || undefined, totalLinea });
    },
    [active, updateItem]
  );

  const subtotal = useMemo(() => active?.items.reduce((acc, item) => acc + (item.totalLinea ?? 0), 0) ?? 0, [active]);
  const descuentos = active?.descuentos ?? 0;
  const envioTotal = active?.envioTotal ?? 0;
  const total = useMemo(() => subtotal - descuentos + envioTotal, [subtotal, descuentos, envioTotal]);

  useEffect(() => {
    if (!active) return;
    const roundedSubtotal = Number(subtotal.toFixed(2));
    const roundedTotal = Number(total.toFixed(2));
    const patch: Partial<Remito> = {};
    if (Math.abs((active.subtotal ?? 0) - roundedSubtotal) > 0.009) patch.subtotal = roundedSubtotal;
    if (Math.abs((active.total ?? 0) - roundedTotal) > 0.009) patch.total = roundedTotal;
    if (Object.keys(patch).length) update(patch);
  }, [active, subtotal, total, update]);

  const onNumberInput = useCallback(
    (field: "descuentos" | "envioTotal") => (event: ChangeEvent<HTMLInputElement>) => {
      const value = numberFromInput(event.target.value);
      update({ [field]: value || undefined });
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

  const handleDownloadPdf = useCallback(async () => {
    if (!active || !pdfRef.current) return;
    setExporting(true);
    setExportError(null);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(pdfRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const imageData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
      const width = canvas.width * ratio;
      const height = canvas.height * ratio;
      const x = (pageWidth - width) / 2;
      const y = (pageHeight - height) / 2;
      pdf.addImage(imageData, "PNG", x, y, width, height);
      const fileName = `${active.remitoId || "remito"}.pdf`;
      pdf.save(fileName);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo generar el PDF";
      setExportError(message);
    } finally {
      setExporting(false);
    }
  }, [active]);

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

      {/* ====== Encabezado editable + visible para PDF ====== */}
      <main ref={pdfRef} className="max-w-[1220px] mx-auto px-4 py-6 space-y-6">
        <section className="bg-white rounded-lg shadow-sm border p-4 space-y-3">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col text-sm">
              <span className="font-medium">Fecha</span>
              <input
                type="date"
                value={active.fecha ?? dayjs().format("YYYY-MM-DD")}
                onChange={(e) => update({ fecha: e.target.value })}
                className="border rounded px-3 py-2"
              />
            </label>
            <label className="flex flex-col text-sm">
              <span className="font-medium">Vendedor</span>
              <select
                value={active.vendedor ?? ""}
                onChange={(e) => update({ vendedor: e.target.value })}
                className="border rounded px-3 py-2"
              >
                <option value="">Seleccionar…</option>
                {EMPLEADOS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="flex flex-col text-sm">
              <span className="font-medium">Método de pago</span>
              <select
                value={pagoMetodo}
                onChange={(e) => updatePago("metodo", e.target.value)}
                className="border rounded px-3 py-2"
              >
                <option value="">Seleccionar…</option>
                {METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>

          {/* Línea de lectura para PDF */}
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div className="border rounded px-3 py-2">
              <span className="font-medium mr-2">VENDEDOR:</span>
              <span>{active.vendedor || "—"}</span>
            </div>
            <div className="border rounded px-3 py-2">
              <span className="font-medium mr-2">MÉTODO DE PAGO:</span>
              <span>{active.pago?.metodo || "—"}</span>
            </div>
          </div>
        </section>

        {/* ====== Datos del cliente ====== */}
        <section className="bg-white rounded-lg shadow-sm border p-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col text-sm">
            <span className="font-medium">Nombre del cliente</span>
            <input
              value={cliente.nombre}
              onChange={(e) => updateCliente("nombre", e.target.value)}
              className="border rounded px-3 py-2"
              placeholder="Nombre"
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="font-medium">DNI</span>
            <input
              value={cliente.dni}
              onChange={(e) => updateCliente("dni", e.target.value)}
              className="border rounded px-3 py-2"
              placeholder="DNI"
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="font-medium">Provincia</span>
            <input
              value={cliente.provincia}
              onChange={(e) => updateCliente("provincia", e.target.value)}
              className="border rounded px-3 py-2"
              placeholder="Provincia"
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="font-medium">Localidad</span>
            <input
              value={cliente.localidad}
              onChange={(e) => updateCliente("localidad", e.target.value)}
              className="border rounded px-3 py-2"
              placeholder="Localidad"
            />
          </label>
        </section>

        {/* ====== Items ====== */}
        <section className="bg-white rounded-lg shadow-sm border overflow-auto">
          <datalist id={datalistId}>
            {suggestions.map((option, i) => (
              <option
                key={`${option.label}-${option.code ?? i}`}
                value={option.label}
                label={option.code ?? undefined}
              />
            ))}
          </datalist>

          {productsError && (
            <p className="px-3 pt-3 text-xs text-red-600">
              No se pudo cargar el stock: {productsError}
            </p>
          )}
          {loadingProducts && !productsError && (
            <p className="px-3 pt-3 text-xs text-neutral-500">Cargando stock...</p>
          )}

          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-100 text-neutral-700">
              <tr className="border-b border-neutral-200">
                <th className="px-3 py-2 text-left">Código</th>
                <th className="px-3 py-2 text-left">Artículo</th>
                <th className="px-3 py-2 text-left">A PAGAR</th>
                {TALLE_KEYS.map((t) => (
                  <th key={t} className="px-2 py-2 text-center">{t}</th>
                ))}
                <th className="px-3 py-2 text-center">Cantidad</th>
                <th className="px-3 py-2 text-right">Total línea</th>
              </tr>
            </thead>
            <tbody>
              {active.items.map((item, index) => (
                <tr key={index} className="border-b last:border-0 border-neutral-200">
                  <td className="px-3 py-2">
                    <input
                      value={item.codigo ?? ""}
                      onChange={(e) => updateItem(index, { codigo: e.target.value })}
                      className="border rounded px-2 py-1 w-full"
                      placeholder="Código"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={item.articulo ?? ""}
                      onChange={(e) => handleArticuloChange(index, e.target.value)}
                      list={datalistId}
                      className="border rounded px-2 py-1 w-full"
                      placeholder="Artículo"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={numericValueOrEmpty(item.precio)}
                      placeholder=""
                      onChange={(e) => handlePrecioChange(index, e)}
                      className="border rounded px-2 py-1 w-28 text-right"
                    />
                  </td>
                  {TALLE_KEYS.map((t) => (
                    <td key={t} className="px-2 py-2 text-center">
                      <input
                        type="number"
                        value={numericValueOrEmpty(item.talles?.[t])}
                        placeholder=""
                        onChange={(e) => handleTalleChange(index, t, e)}
                        className="border rounded px-2 py-1 w-16 text-center"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center">
                    <input
                      type="text"
                      value={item.cantTotal && item.cantTotal > 0 ? String(item.cantTotal) : ""}
                      readOnly
                      className="border rounded px-2 py-1 w-20 bg-neutral-100 text-center"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {item.totalLinea ? formatARS(item.totalLinea) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ====== Observaciones + Totales ====== */}
        <section className="grid gap-4 md:grid-cols-[2fr,1fr]">
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <label className="flex flex-col text-sm gap-2">
              <span className="font-medium">Observaciones</span>
              <textarea
                value={active.observaciones ?? ""}
                onChange={(e) => update({ observaciones: e.target.value })}
                rows={6}
                className="border rounded px-3 py-2"
              />
            </label>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">Subtotal</span>
              <span>{formatARS(subtotal)}</span>
            </div>
            <label className="flex items-center justify-between gap-3">
              <span className="font-medium">Descuentos</span>
              <input
                type="number"
                step="0.01"
                value={numericValueOrEmpty(descuentos)}
                placeholder=""
                onChange={onNumberInput("descuentos")}
                className="border rounded px-2 py-1 w-28 text-right"
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="font-medium">Envío</span>
              <input
                type="number"
                step="0.01"
                value={numericValueOrEmpty(envioTotal)}
                placeholder=""
                onChange={onNumberInput("envioTotal")}
                className="border rounded px-2 py-1 w-28 text-right"
              />
            </label>
            <div className="flex items-center justify-between text-base font-semibold">
              <span>Total</span>
              <span>{formatARS(total)}</span>
            </div>

            <button
              type="button"
              onClick={handleGuardar}
              disabled={saving}
              className="w-full mt-3 rounded bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar remito"}
            </button>
            {saveStatus === "success" && saveMessage && (
              <p className="text-xs text-green-600">{saveMessage}</p>
            )}
            {saveStatus === "error" && saveMessage && (
              <p className="text-xs text-red-600">{saveMessage}</p>
            )}

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={exporting}
              className="w-full mt-2 rounded border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-60"
            >
              {exporting ? "Generando PDF..." : "Descargar PDF"}
            </button>
            {exportError && <p className="text-xs text-red-600">{exportError}</p>}
          </div>
        </section>
      </main>
    </>
  );
}
