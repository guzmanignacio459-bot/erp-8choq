'use client';
import { useEffect, useMemo, useState } from "react";
"use client";

type Remito = Record<string, string>;
import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dayjs from "dayjs";

export default function RemitosPage() {
  const [data, setData] = useState<Remito[]>([]);
  const [q, setQ] = useState("");
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

export const EMPLEADOS = [
  "Agustina",
  "Candela",
  "Cecilia",
  "Florencia",
  "Valentina",
];

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
  const { remitos, activeId, setActive, addRemito, updateRemito } =
    useRemitosStore();
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
    "idle"
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const pdfRef = useRef<HTMLElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const active = useMemo(() => {
    if (!remitos.length) return undefined;
    const found = activeId
      ? remitos.find((r) => r.remitoId === activeId)
      : undefined;
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
      keys.forEach((key) => {
        map.set(key.toLowerCase(), product);
      });
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
    if (!active && remitos.length) {
      setActive(remitos[0].remitoId);
    }
  }, [active, remitos, setActive]);

  useEffect(() => {
    setSaveStatus("idle");
    setSaveMessage(null);
    setExportError(null);
  }, [active?.remitoId]);

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
      if (!value) {
        delete next[field];
      }
      if (!Object.keys(next).length) {
        update({ pago: undefined });
      } else {
        update({ pago: next });
      }
    },
    [active, update]
  );

  const updateItem = useCallback(
    (index: number, patch: Partial<Item>) => {
      if (!active) return;
      const items = active.items.map((item, i) =>
        i === index ? { ...item, ...patch } : item
      );
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
        updateItem(index, {
          articulo: "",
          codigo: "",
          precio: 0,
          totalLinea: 0,
        });
        return;
      }

      const product = productLookup.get(trimmed.toLowerCase());
      if (!product) {
        updateItem(index, { articulo: value });
        return;
      }

      const patch: Partial<Item> = {
        articulo: product.name ?? value,
      };
      if (product.code) {
        patch.codigo = product.code;
      }
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
    (
      index: number,
      talle: keyof Talles,
      event: ChangeEvent<HTMLInputElement>
    ) => {
      const value = event.target.value;
      const qty = numberFromInput(value);
      const item = active?.items[index];
      if (!item) return;
      const talles = { ...(item.talles ?? {}) };
      talles[talle] = qty;
      const cantTotal = TALLE_KEYS.reduce(
        (acc, key) => acc + (talles[key] ?? 0),
        0
      );
      const totalLinea = cantTotal * (item.precio ?? 0);
      updateItem(index, { talles, cantTotal, totalLinea });
    },
    [active, updateItem]
  );

  const subtotal = useMemo(() => {
    if (!active) return 0;
    return active.items.reduce((acc, item) => acc + (item.totalLinea ?? 0), 0);
  }, [active]);

  const descuentos = active?.descuentos ?? 0;
  const envioTotal = active?.envioTotal ?? 0;
  const total = useMemo(
    () => subtotal - descuentos + envioTotal,
    [subtotal, descuentos, envioTotal]
  );

  useEffect(() => {
    if (!active) return;
    const roundedSubtotal = Number(subtotal.toFixed(2));
    const roundedTotal = Number(total.toFixed(2));
    const patch: Partial<Remito> = {};
    if (Math.abs((active.subtotal ?? 0) - roundedSubtotal) > 0.009) {
      patch.subtotal = roundedSubtotal;
    }
    if (Math.abs((active.total ?? 0) - roundedTotal) > 0.009) {
      patch.total = roundedTotal;
    }
    if (Object.keys(patch).length) {
      update(patch);
    }
  }, [active, subtotal, total, update]);

  const onNumberInput = useCallback(
    (field: "descuentos" | "envioTotal") =>
      (event: ChangeEvent<HTMLInputElement>) => {
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

    const subtotalValue = Number(subtotal.toFixed(2));
    const totalValue = Number(total.toFixed(2));
    const descuentosValue = Number((descuentos ?? 0).toFixed(2));
    const envioValue = Number((envioTotal ?? 0).toFixed(2));

    const cliente = {
      nombre: active.cliente?.nombre ?? "",
      dni: active.cliente?.dni ?? "",
      provincia: active.cliente?.provincia ?? "",
      localidad: active.cliente?.localidad ?? "",
    };

    const items = active.items
      .map((item) => {
        const talles: Record<string, number> = {};
        TALLE_KEYS.forEach((key) => {
          const qty = item.talles?.[key];
          if (qty) {
            talles[key] = qty;
          }
        });
        return {
          codigo: item.codigo ?? "",
          articulo: item.articulo ?? "",
          precio: item.precio ?? 0,
          cantTotal: item.cantTotal ?? 0,
          totalLinea: item.totalLinea ?? 0,
          talles,
        };
      })
      .filter((item) => item.codigo || item.articulo || item.cantTotal);

    const payload = {
      remito: {
        remitoId: active.remitoId,
        fecha: active.fecha,
        mayorista: active.mayorista,
        cliente,
        vendedor: active.vendedor ?? "",
        pago: active.pago,
        items,
        subtotal: subtotalValue,
        descuentos: descuentosValue,
        envioTotal: envioValue,
        total: totalValue,
        observaciones: active.observaciones ?? "",
        nombreHoja: active.nombreHoja ?? "",
        pagado: active.pagado ?? false,
      },
    };

    try {
      const response = await fetch("/api/remitos/remitos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "No se pudo guardar el remito");
      }

      const operacion = json?.operacion;
      let message = "Remito guardado correctamente.";
      if (operacion) {
        message = `Bruto ${formatARS(operacion.bruto)} · Retención ${formatARS(
          operacion.retencion
        )} · Neto ${formatARS(operacion.neto)}`;
      }
      if (json?.operationsSaved === false) {
        message += " · No se pudo guardar Planilla de Operaciones";
      }

      setSaveStatus("success");
      setSaveMessage(message);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo guardar el remito";
      setSaveStatus("error");
      setSaveMessage(message);
    } finally {
      setSaving(false);
    }
  }, [
    active,
    descuentos,
    envioTotal,
    subtotal,
    total,
  ]);

  const handleDownloadPdf = useCallback(async () => {
    if (!active || !pdfRef.current) return;
    setExporting(true);
    setExportError(null);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(pdfRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
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
      const message =
        error instanceof Error ? error.message : "No se pudo generar el PDF";
      setExportError(message);
    } finally {
      setExporting(false);
    }
  }, [active, pdfRef]);

  if (!active) {
    return (
      <>
        <RemitoTabs />
        <main className="max-w-[1220px] mx-auto px-4 py-6">
          <p className="text-neutral-600">No hay remitos abiertos.</p>
        </main>
      </>
    );
  }, [data, q]);
  }

  const cliente = active.cliente ?? {
    nombre: "",
    dni: "",
    provincia: "",
    localidad: "",
  };

  const totalMostrado = useMemo(() => {
    const key = Object.keys(data[0] || {}).find(k => k.toLowerCase().includes("total"));
    return filtered.reduce((acc, r) => acc + Number((r[key ?? "Total Final"] || "0").toString().replace(/[.$\s]/g,"").replace(",", ".")), 0);
  }, [filtered, data]);
  const pagoMetodo = active.pago?.metodo ?? "";

  return (
    <main className="max-w-[1220px] mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Listado</h1>

      <div className="flex items-center gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, ID, DNI, método, etc."
          className="border rounded-md px-3 py-2 w-full max-w-[420px]"
        />
        <div className="text-sm font-semibold">
          Total mostrado:{" "}
          {totalMostrado.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
    <>
      <RemitoTabs />
      <main
        ref={pdfRef}
        className="max-w-[1220px] mx-auto px-4 py-6 space-y-6"
      >
        <div className="flex flex-wrap items-center gap-2">
          {remitos.map((r) => {
            const selected = r.remitoId === active.remitoId;
            return (
              <button
                key={r.remitoId}
                onClick={() => setActive(r.remitoId)}
                className={`px-3 py-1 text-sm rounded-md border ${
                  selected
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                }`}
              >
                {r.remitoId}
              </button>
            );
          })}
          <button
            onClick={() => addRemito()}
            className="px-3 py-1 text-sm rounded-md border border-dashed border-neutral-400 text-neutral-600 hover:border-neutral-500 hover:text-neutral-900"
          >
            + Nuevo remito
          </button>
        </div>
      </div>

      <div className="overflow-auto border rounded-md">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-neutral-100 border-b">
            <tr>
              <th className="px-2 py-2 text-left">ID Remito</th>
              <th className="px-2 py-2 text-left">Fecha</th>
              <th className="px-2 py-2 text-left">Nombre</th>
              <th className="px-2 py-2 text-left">Método De Pago</th>
              <th className="px-2 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="px-2 py-2">{r["ID Remito"] || r["ID"] || ""}</td>
                <td className="px-2 py-2">{r["Fecha"] || ""}</td>
                <td className="px-2 py-2">{r["Nombre"] || ""}</td>
                <td className="px-2 py-2">{r["Método De Pago"] || r["Metodo De Pago"] || ""}</td>
                <td className="px-2 py-2 text-right">{r["Total Final"] || r["Total"] || ""}</td>
              </tr>

        <section className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col text-sm gap-1">
              <span className="font-medium text-neutral-700">ID Remito</span>
              <input
                value={active.remitoId}
                readOnly
                className="border border-neutral-300 rounded-md px-3 py-2 bg-neutral-100 text-neutral-700"
              />
            </label>
            <label className="flex flex-col text-sm gap-1">
              <span className="font-medium text-neutral-700">Fecha</span>
              <input
                type="date"
                value={active.fecha ?? dayjs().format("YYYY-MM-DD")}
                onChange={(event) => update({ fecha: event.target.value })}
                className="border border-neutral-300 rounded-md px-3 py-2"
              />
            </label>
            <label className="flex flex-col text-sm gap-1">
              <span className="font-medium text-neutral-700">Vendedor</span>
              <select
                value={active.vendedor ?? ""}
                onChange={(event) => update({ vendedor: event.target.value })}
                className="border border-neutral-300 rounded-md px-3 py-2"
              >
                <option value="">Seleccionar vendedor</option>
                {EMPLEADOS.map((empleado) => (
                  <option key={empleado} value={empleado}>
                    {empleado}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-sm gap-1">
              <span className="font-medium text-neutral-700">Método de pago</span>
              <select
                value={pagoMetodo}
                onChange={(event) => updatePago("metodo", event.target.value)}
                className="border border-neutral-300 rounded-md px-3 py-2"
              >
                <option value="">Seleccionar método</option>
                {METODOS_PAGO.map((metodo) => (
                  <option key={metodo} value={metodo}>
                    {metodo}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(active.mayorista)}
                onChange={(event) => update({ mayorista: event.target.checked })}
              />
              <span className="font-medium text-neutral-700">Mayorista</span>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col text-sm gap-1">
              <span className="font-medium text-neutral-700">Nombre del cliente</span>
              <input
                value={cliente.nombre}
                onChange={(event) => updateCliente("nombre", event.target.value)}
                placeholder="Nombre"
                className="border border-neutral-300 rounded-md px-3 py-2"
              />
            </label>
            <label className="flex flex-col text-sm gap-1">
              <span className="font-medium text-neutral-700">DNI</span>
              <input
                value={cliente.dni ?? ""}
                onChange={(event) => updateCliente("dni", event.target.value)}
                placeholder="DNI"
                className="border border-neutral-300 rounded-md px-3 py-2"
              />
            </label>
            <label className="flex flex-col text-sm gap-1">
              <span className="font-medium text-neutral-700">Provincia</span>
              <input
                value={cliente.provincia ?? ""}
                onChange={(event) => updateCliente("provincia", event.target.value)}
                placeholder="Provincia"
                className="border border-neutral-300 rounded-md px-3 py-2"
              />
            </label>
            <label className="flex flex-col text-sm gap-1">
              <span className="font-medium text-neutral-700">Localidad</span>
              <input
                value={cliente.localidad ?? ""}
                onChange={(event) => updateCliente("localidad", event.target.value)}
                placeholder="Localidad"
                className="border border-neutral-300 rounded-md px-3 py-2"
              />
            </label>
          </div>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-auto">
          <datalist id={datalistId}>
            {suggestions.map((option, index) => (
              <option
                key={`${option.label}-${option.code ?? index}`}
                value={option.label}
                label={option.code ?? undefined}
              />
            ))}
          </tbody>
        </table>
      </div>
    </main>
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
                <th className="px-3 py-2 text-left">Precio</th>
                {TALLE_KEYS.map((talle) => (
                  <th key={talle} className="px-2 py-2 text-center">
                    {talle}
                  </th>
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
                      value={item.codigo}
                      onChange={(event) => updateItem(index, { codigo: event.target.value })}
                      className="border border-neutral-300 rounded-md px-2 py-1 w-full"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={item.articulo}
                      onChange={(event) =>
                        handleArticuloChange(index, event.target.value)
                      }
                      list={datalistId}
                      className="border border-neutral-300 rounded-md px-2 py-1 w-full"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={numericValueOrEmpty(item.precio)}
                      placeholder="0"
                      onChange={(event) => handlePrecioChange(index, event)}
                      className="border border-neutral-300 rounded-md px-2 py-1 w-28"
                    />
                  </td>
                  {TALLE_KEYS.map((talle) => (
                    <td key={talle} className="px-2 py-2 text-center">
                      <input
                        type="number"
                        value={numericValueOrEmpty(item.talles?.[talle] ?? 0)}
                        placeholder="0"
                        onChange={(event) => handleTalleChange(index, talle, event)}
                        className="border border-neutral-300 rounded-md px-2 py-1 w-16 text-center"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center">
                    <input
                      type="number"
                      value={numericValueOrEmpty(item.cantTotal ?? 0)}
                      placeholder="0"
                      readOnly
                      className="border border-neutral-300 rounded-md px-2 py-1 w-20 bg-neutral-100 text-center"
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

        <section className="grid gap-4 md:grid-cols-[2fr,1fr]">
          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4">
            <label className="flex flex-col text-sm gap-2">
              <span className="font-medium text-neutral-700">Observaciones</span>
              <textarea
                value={active.observaciones ?? ""}
                onChange={(event) => update({ observaciones: event.target.value })}
                rows={6}
                className="border border-neutral-300 rounded-md px-3 py-2"
              />
            </label>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-neutral-700">Subtotal</span>
              <span>{formatARS(subtotal)}</span>
            </div>
            <label className="flex items-center justify-between gap-3">
              <span className="font-medium text-neutral-700">Descuentos</span>
              <input
                type="number"
                step="0.01"
                value={numericValueOrEmpty(descuentos)}
                placeholder="0"
                onChange={onNumberInput("descuentos")}
                className="border border-neutral-300 rounded-md px-2 py-1 w-28 text-right"
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="font-medium text-neutral-700">Envío</span>
              <input
                type="number"
                step="0.01"
                value={numericValueOrEmpty(envioTotal)}
                placeholder="0"
                onChange={onNumberInput("envioTotal")}
                className="border border-neutral-300 rounded-md px-2 py-1 w-28 text-right"
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
              className="w-full mt-3 inline-flex items-center justify-center rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="w-full mt-2 inline-flex items-center justify-center rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting ? "Generando PDF..." : "Descargar PDF"}
            </button>
            {exportError && (
              <p className="text-xs text-red-600">{exportError}</p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}