"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  Plus,
  Loader2,
  Printer,
  Download,
  ListChecks,
  Trash2,
} from "lucide-react";

import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ---- Tipos base ----
type InputChange = React.ChangeEvent<HTMLInputElement>;
type TextareaChange = React.ChangeEvent<HTMLTextAreaElement>;

// tamaños
const SIZE_LIST = ["S", "M", "L", "XL", "XXL", "XXXL"] as const;
const BASE_SIZES = ["S", "M", "L", "XL"] as const;
const EXTRA_SIZES = ["XXL", "XXXL"] as const;
type SizeKey = (typeof SIZE_LIST)[number];

// Fila de la tabla (multi-talle) con SKUs por talle
export type RemitoItem = {
  sku?: string; // SKU base (sin talle, puede incluir -SCNL)
  articulo?: string;
  precioUnitario: number | string;
  talles: Partial<Record<SizeKey, number>>;
  skus?: Partial<Record<SizeKey, string>>; // SKU por talle
};

type PaymentSplit = {
  metodo: string;
  monto: string;
};

type FormState = {
  fechaISO: string;
  nombre: string;
  dni: string;
  localidad: string;
  telefono: string;
  transporte: string;
  metodoPago: string; // compat
  vendedor: string;
  condicionCompra: string;
  estado: string;
  recargoDescuento: string;
  detalleGeneral: string;
  envio: string;
  items: RemitoItem[];
  pagos: PaymentSplit[];
};

// ---- Catálogos ----
type Catalogs = {
  metodosPago: string[];
  transportes: string[];
  vendedores: string[];
  condicionesCompra: string[];
  estados: string[];
};

// Respuesta Apps Script
type StockRow = { sku: string; articulo: string };

// ====== Cache + debounce ======
type SkuInfo = { articulo: string };
const skuCache = new Map<string, SkuInfo>();

function debounce<F extends (...args: any[]) => any>(fn: F, wait = 260) {
  let t: any;
  return (...args: Parameters<F>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** ===== Helpers SKU base / owner ===== */

// Devuelve base + owner (SCNL o null) a partir de un SKU que puede tener talle y/o -SCNL
function parseSkuMeta(raw: string): { base: string; owner: string | null } {
  let up = (raw || "").trim().toUpperCase();
  if (!up) return { base: "", owner: null };

  let owner: string | null = null;

  if (up.endsWith("-SCNL")) {
    owner = "SCNL";
    up = up.slice(0, -5); // quitar "-SCNL"
  }

  const m = up.match(/^(.*)-(S|M|L|XL|XXL|XXXL)$/);
  if (m) {
    return { base: m[1], owner };
  }

  return { base: up, owner };
}

function buildSku(base: string, size: SizeKey, owner?: string | null) {
  const up = (base || "").trim().toUpperCase();
  if (!up) return "";
  const ownerSuffix = owner?.toUpperCase() === "SCNL" ? "-SCNL" : "";
  return `${up}-${size}${ownerSuffix}`;
}

function looksLikeBase(s: string) {
  const up = (s || "").trim().toUpperCase();
  if (!up) return false;
  // Si ya tiene talle explícito, no lo consideramos "base"
  const hasSize = /-(S|M|L|XL|XXL|XXXL)(-SCNL)?$/.test(up);
  return !hasSize;
}

const FALLBACK_CATALOGS: Catalogs = {
  metodosPago: [
    "MP 1",
    "MP 2",
    "MP 3",
    "Transferencia Santander",
    "Transferencia Galicia",
    "DÉBITO",
    "QR",
    "EFECTIVO",
    "E-CHECK",
  ],
  transportes: [
    "Retiro en local",
    "OCA",
    "Correo Argentino",
    "Andreani",
    "Via Cargo",
    "Otro",
  ],
  vendedores: ["Santiago", "Paula", "Malena", "Nacho"],
  condicionesCompra: ["Minorista", "Mayorista"],
  estados: ["Pendiente", "Pagado", "Anulado"],
};

const EMPTY_ITEM: RemitoItem = {
  sku: "",
  articulo: "",
  precioUnitario: 0,
  talles: { S: 0, M: 0, L: 0, XL: 0, XXL: 0, XXXL: 0 },
  skus: { S: "", M: "", L: "", XL: "", XXL: "", XXXL: "" },
};

const EMPTY_FORM: FormState = {
  fechaISO: "",
  nombre: "",
  dni: "",
  localidad: "",
  telefono: "",
  transporte: "",
  metodoPago: "",
  vendedor: "",
  condicionCompra: "",
  estado: "Pendiente",
  recargoDescuento: "",
  detalleGeneral: "",
  envio: "0",
  items: [structuredClone(EMPTY_ITEM)],
  pagos: [{ metodo: "", monto: "" }],
};

const GS_URL =
  (process.env.NEXT_PUBLIC_GS_URL ?? process.env.APPS_SCRIPT_URL ?? "").trim();

const EditorRemitos: React.FC = () => {
  const printableRef = useRef<HTMLDivElement>(null);

  const [catalogs, setCatalogs] = useState<Catalogs | null>(null);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [sugsByRow, setSugsByRow] = useState<Record<number, StockRow[]>>({});
  const debounceRef = useRef<Record<number, any>>({});

  const [showMoreSizes, setShowMoreSizes] = useState(false);

  // edición
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingRemito, setLoadingRemito] = useState(false);

  const [form, setForm] = useState<FormState>(() => structuredClone(EMPTY_FORM));

  // ---- PDF ----
  const handlePrint = () => window.print();

  const handleDownloadPDF = async () => {
    const node = printableRef.current;
    if (!node) return;

    window.scrollTo(0, 0);

    const canvas = await html2canvas(node, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "pt", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const rawName = (form.nombre || "remito").trim() || "remito";
    const safeName = rawName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .replace(/\s+/g, "-");
    const dateStr = (form.fechaISO || new Date().toISOString()).slice(0, 10);

    pdf.save(`${safeName}-${dateStr}.pdf`);
  };

  // ---- helpers change ----
  const onInput =
    <K extends keyof FormState>(key: K) =>
    (e: InputChange) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const onTextarea =
    <K extends keyof FormState>(key: K) =>
    (e: TextareaChange) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSelect =
    <K extends keyof FormState>(key: K) =>
    (v: string) =>
      setForm((f) => ({ ...f, [key]: v }));

  const updateItem = (idx: number, patch: Partial<RemitoItem>) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  };

  const updateTalle = (idx: number, talle: SizeKey, value: number) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) =>
        i === idx ? { ...it, talles: { ...it.talles, [talle]: value } } : it
      ),
    }));
  };

  const setSkuForTalle = (idx: number, talle: SizeKey, sku: string) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) =>
        i === idx ? { ...it, skus: { ...(it.skus || {}), [talle]: sku } } : it
      ),
    }));
  };

  const addItem = () =>
    setForm((f) => ({
      ...f,
      items: [...f.items, structuredClone(EMPTY_ITEM)],
    }));

  const removeItem = (idx: number) => {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
    setSugsByRow((m) => {
      const copy = { ...m };
      delete copy[idx];
      return copy;
    });
  };

  // ---- pagos múltiples ----
  const updatePago = (idx: number, patch: Partial<PaymentSplit>) => {
    setForm((f) => ({
      ...f,
      pagos: f.pagos.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));
  };

  const addPago = () =>
    setForm((f) => ({ ...f, pagos: [...f.pagos, { metodo: "", monto: "" }] }));

  const removePago = (idx: number) =>
    setForm((f) => ({ ...f, pagos: f.pagos.filter((_, i) => i !== idx) }));

  const totalPagos = useMemo(
    () =>
      (form.pagos || []).reduce(
        (acc, p) => (p.metodo ? acc + (Number(p.monto || 0) || 0) : acc),
        0
      ),
    [form.pagos]
  );

  // ---- cálculos ítems ----
  const rowCantidad = (it: RemitoItem) =>
    SIZE_LIST.reduce((acc, t) => acc + Number(it.talles?.[t] || 0), 0);

  const rowSubtotal = (it: RemitoItem) =>
    rowCantidad(it) * Number(it.precioUnitario || 0);

  const calcSubtotal = useMemo(
    () => form.items.reduce((acc, it) => acc + rowSubtotal(it), 0),
    [form.items]
  );

  const prendas = useMemo(
    () => form.items.reduce((acc, it) => acc + rowCantidad(it), 0),
    [form.items]
  );

  const totalFinal = useMemo(() => {
    const d = (form.recargoDescuento || "").toString().trim();
    let total = calcSubtotal + Number(form.envio || 0);
    if (d) {
      if (d.endsWith("%")) {
        const p = Number(d.replace("%", "").replace(",", ".")) || 0;
        total = total * (1 - p / 100);
      } else {
        const val = Number(d.replace(",", ".")) || 0;
        total = total + val;
      }
    }
    return Math.round((total + Number.EPSILON) * 100) / 100;
  }, [calcSubtotal, form.envio, form.recargoDescuento]);

  // ---- catálogos ----
  useEffect(() => {
    if (!GS_URL) {
      setCatalogs(FALLBACK_CATALOGS);
      return;
    }

    const load = async () => {
      setLoadingCatalogs(true);
      try {
        const res = await fetch(GS_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify({ action: "getCatalogs" }),
          cache: "no-store",
        });
        const json = await res.json();
        if (json?.ok && json.data) {
          const merged: Catalogs = {
            metodosPago:
              json.data.metodosPago?.length ??
              FALLBACK_CATALOGS.metodosPago.length
                ? json.data.metodosPago || FALLBACK_CATALOGS.metodosPago
                : FALLBACK_CATALOGS.metodosPago,
            transportes:
              json.data.transportes?.length ??
              FALLBACK_CATALOGS.transportes.length
                ? json.data.transportes || FALLBACK_CATALOGS.transportes
                : FALLBACK_CATALOGS.transportes,
            vendedores:
              json.data.vendedores?.length ??
              FALLBACK_CATALOGS.vendedores.length
                ? json.data.vendedores || FALLBACK_CATALOGS.vendedores
                : FALLBACK_CATALOGS.vendedores,
            condicionesCompra:
              json.data.condicionesCompra?.length ??
              FALLBACK_CATALOGS.condicionesCompra.length
                ? json.data.condicionesCompra ||
                  FALLBACK_CATALOGS.condicionesCompra
                : FALLBACK_CATALOGS.condicionesCompra,
            estados:
              json.data.estados?.length ?? FALLBACK_CATALOGS.estados.length
                ? json.data.estados || FALLBACK_CATALOGS.estados
                : FALLBACK_CATALOGS.estados,
          };
          setCatalogs(merged);
        } else {
          setCatalogs(FALLBACK_CATALOGS);
        }
      } catch {
        setCatalogs(FALLBACK_CATALOGS);
      } finally {
        setLoadingCatalogs(false);
      }
    };

    load();

    if (GS_URL) {
      fetch(GS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ action: "ping" }),
      }).catch(() => {});
    }
  }, []);

  // ---- Cargar remito en modo edición (?id=R-...) ----
  useEffect(() => {
    if (!GS_URL) return;
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) return;

    const loadRemito = async () => {
      setLoadingRemito(true);
      setMsg(null);
      try {
        const res = await fetch(GS_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify({ action: "getRemito", id }),
          cache: "no-store",
        });

        const json = await res.json();
        if (!json?.ok || !json.data) {
          setMsg("❌ No se pudo cargar el remito para edición");
          return;
        }

        const r = json.data;

        // Agrupar items en filas multi-talle
        const map = new Map<
          string,
          {
            baseSku: string;
            articulo: string;
            precioUnitario: number;
            talles: RemitoItem["talles"];
            skus: RemitoItem["skus"];
          }
        >();

        (Array.isArray(r.items) ? r.items : []).forEach((it: any) => {
          const talla = String(it.talle || "").toUpperCase() as SizeKey;
          const cant = Number(it.cantidad || 0) || 0;
          if (!talla || cant <= 0) return;

          const sku = String(it.sku || "");
          const articulo = String(it.articulo || "");
          const precioUnitario = Number(it.precioUnitario || 0) || 0;
          const meta = parseSkuMeta(sku);
          const baseSku = meta.base || sku;

          const key = `${baseSku}|${articulo}|${precioUnitario}`;
          let agg = map.get(key);
          if (!agg) {
            agg = {
              baseSku,
              articulo,
              precioUnitario,
              talles: {
                S: 0,
                M: 0,
                L: 0,
                XL: 0,
                XXL: 0,
                XXXL: 0,
              },
              skus: {
                S: "",
                M: "",
                L: "",
                XL: "",
                XXL: "",
                XXXL: "",
              },
            };
            map.set(key, agg);
          }

          agg.talles![talla] = (agg.talles![talla] || 0) + cant;
          agg.skus![talla] = sku;
        });

        const items: RemitoItem[] =
          map.size > 0
            ? Array.from(map.values()).map((agg) => ({
                sku: agg.baseSku,
                articulo: agg.articulo,
                precioUnitario: agg.precioUnitario,
                talles: agg.talles!,
                skus: agg.skus!,
              }))
            : structuredClone(EMPTY_FORM.items);

        setEditingId(r.id || id);

        setForm((f) => ({
          ...f,
          fechaISO: r.fecha
            ? new Date(r.fecha).toISOString()
            : new Date().toISOString(),
          nombre: r.nombre || "",
          dni: r.dni || "",
          localidad: r.localidad || "",
          telefono: r.telefono || "",
          transporte: r.transporte || "",
          vendedor: r.vendedor || "",
          condicionCompra: r.condicionCompra || "",
          estado: r.estado || "Pendiente",
          recargoDescuento:
            r.recargoDescuento !== undefined && r.recargoDescuento !== null
              ? String(r.recargoDescuento)
              : "",
          detalleGeneral: r.detalleGeneral || "",
          envio:
            r.totales && r.totales.costoEnvio != null
              ? String(r.totales.costoEnvio)
              : "0",
          metodoPago: r.metodoPago || "",
          items,
        }));
      } catch (e: any) {
        setMsg("❌ Error al cargar remito: " + (e?.message || e));
      } finally {
        setLoadingRemito(false);
      }
    };

    loadRemito();
  }, []);

  // ---- search stock ----
  const searchStock = (rowIndex: number, params: { articulo?: string; q?: string }) => {
    if (!GS_URL) return;
    if (debounceRef.current[rowIndex])
      clearTimeout(debounceRef.current[rowIndex]);

    debounceRef.current[rowIndex] = setTimeout(async () => {
      try {
        const res = await fetch(GS_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify({ action: "searchStock", ...params, limit: 25 }),
        });
        const json = await res.json();
        if (json?.ok && Array.isArray(json.data)) {
          setSugsByRow((m) => ({ ...m, [rowIndex]: json.data as StockRow[] }));
        }
      } catch {
        // silencio
      }
    }, 250);
  };

  const lookupSkuImmediate = async (rowIndex: number, sku: string) => {
    const clean = sku.trim();
    if (!clean) return;
    const cached = skuCache.get(clean);
    if (cached?.articulo) {
      const curr = form.items[rowIndex];
      if (!curr.articulo) updateItem(rowIndex, { articulo: cached.articulo });
      return;
    }
    if (!GS_URL) return;

    try {
      const res = await fetch(GS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ action: "searchStock", q: clean, limit: 1 }),
      });
      const json = await res.json();
      const first: StockRow | undefined =
        json?.ok && Array.isArray(json.data) ? json.data[0] : undefined;
      if (first?.articulo) {
        skuCache.set(clean, { articulo: first.articulo });
        const curr = form.items[rowIndex];
        if (!curr.articulo) updateItem(rowIndex, { articulo: first.articulo });
        setSugsByRow((m) => ({ ...m, [rowIndex]: first ? [first] : [] }));
      }
    } catch {
      // silencio
    }
  };

  const lookupSkuDebounced = useMemo(
    () =>
      debounce((rowIndex: number, sku: string) => {
        lookupSkuImmediate(rowIndex, sku);
      }, 220),
    []
  );

  // ---- Guardar ----
  const handleSave = async () => {
    if (!GS_URL) {
      setMsg("❌ Falta configurar la URL del Apps Script");
      return;
    }
    if (!form.nombre) {
      setMsg("❌ Falta el nombre del cliente");
      return;
    }

    const flatItems = form.items.flatMap((i) => {
      const precio = Number(i.precioUnitario || 0);
      return SIZE_LIST.flatMap((t) => {
        const cant = Number(i.talles?.[t] || 0);
        if (cant <= 0) return [];
        const skuTalle = i.skus?.[t] || i.sku || "";
        return [
          {
            sku: skuTalle,
            articulo: (i.articulo || "").trim(),
            talle: t,
            cantidad: cant,
            precioUnitario: precio,
          },
        ];
      });
    });

    if (flatItems.length === 0) {
      setMsg("❌ Cargá cantidades en al menos un talle");
      return;
    }

    const multiPagoStr = (form.pagos || [])
      .filter((p) => p.metodo)
      .map((p) => {
        const n = Number(p.monto || 0) || 0;
        return n > 0 ? `${p.metodo} $${n}` : p.metodo;
      })
      .join(" + ");

    const metodoPagoFinal = multiPagoStr || form.metodoPago || "";

    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        action: "saveRemito",
        data: {
          fechaISO: form.fechaISO || new Date().toISOString(),
          nombre: form.nombre,
          dni: form.dni,
          localidad: form.localidad,
          telefono: form.telefono,
          transporte: form.transporte,
          metodoPago: metodoPagoFinal,
          vendedor: form.vendedor,
          condicionCompra: form.condicionCompra,
          estado: form.estado,
          recargoDescuento: form.recargoDescuento,
          detalleGeneral: form.detalleGeneral,
          items: flatItems,
          totales: {
            prendas,
            subtotal: calcSubtotal,
            costoEnvio: Number(form.envio || 0),
            totalFinal,
          },
        },
      };

      const res = await fetch(GS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (json?.ok) {
        setMsg(
          `✅ Remito guardado: ${json.id}${
            editingId ? " (creaste una nueva versión)" : ""
          }`
        );
        setEditingId(null); // volvemos a modo "nuevo"
        setForm(structuredClone(EMPTY_FORM));
        setSugsByRow({});
      } else {
        setMsg("❌ Error al guardar: " + (json?.error || ""));
      }
    } catch (e: any) {
      setMsg("❌ Error de red: " + e?.message);
    } finally {
      setSaving(false);
    }
  };

  // ---- UI ----
  return (
    <div className="mx-auto w-full p-6 space-y-6 print:w-full print:max-w-none">
      {/* Barra superior */}
      <div className="no-print flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold tracking-tight">
            8CHOQ System
          </span>
          <span className="text-sm text-muted-foreground">
            · {editingId ? `Editando remito ${editingId}` : "Nuevo Remito"}
            {loadingRemito && " (cargando...)"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/remitos">
            <Button
              variant="secondary"
              className="gap-2"
              aria-label="Ir a Listado de Remitos"
            >
              <ListChecks className="h-4 w-4" /> Listado
            </Button>
          </Link>
          <Button
            onClick={handleDownloadPDF}
            variant="outline"
            className="gap-2"
            aria-label="Descargar PDF"
          >
            <Download className="h-4 w-4" /> PDF
          </Button>
          <Button
            onClick={handlePrint}
            className="gap-2"
            aria-label="Imprimir"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
        </div>
      </div>

      {/* Remito imprimible */}
      <div ref={printableRef} className="print-area">
        <div className="rounded-xl border-2 border-neutral-700/80 bg-white overflow-hidden shadow-sm">
          {/* LOGO */}
          <div className="px-4 py-3 text-4xl font-black tracking-wide border-b-2 border-neutral-700/80">
            8CHOQ
          </div>

          {/* DATOS CLIENTE */}
          <div className="grid grid-cols-1 md:grid-cols-12">
            {/* Nombre */}
            <div className="md:col-span-6 border-b border-neutral-400/60 md:border-r p-3">
              <div className="text-[13px] font-bold tracking-wide">NOMBRE</div>
              <Input
                value={form.nombre}
                onChange={onInput("nombre")}
                className="bg-transparent"
                placeholder="Cliente"
              />
            </div>

            {/* Envío */}
            <div className="md:col-span-6 border-b border-neutral-400/60 p-3">
              <div className="text-[13px] font-bold tracking-wide">ENVÍO</div>
              <Select
                value={form.transporte}
                onValueChange={onSelect("transporte")}
              >
                <SelectTrigger className="w-full bg-transparent">
                  <SelectValue
                    placeholder={loadingCatalogs ? "Cargando..." : "Seleccionar..."}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(catalogs?.transportes || FALLBACK_CATALOGS.transportes).map(
                    (op) => (
                      <SelectItem key={op} value={op}>
                        {op}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Fecha */}
            <div className="md:col-span-6 border-b border-neutral-400/60 md:border-r p-3">
              <div className="text-[13px] font-bold tracking-wide">FECHA</div>
              <Input
                type="date"
                value={form.fechaISO ? form.fechaISO.slice(0, 10) : ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    fechaISO: new Date(e.target.value).toISOString(),
                  }))
                }
                className="bg-transparent"
              />
            </div>

            {/* Métodos de pago múltiples */}
            <div className="md:col-span-6 border-b border-neutral-400/60 p-3 space-y-1">
              <div className="text-[13px] font-bold tracking-wide">
                MÉTODOS DE PAGO
              </div>
              <div className="space-y-1">
                {form.pagos.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[12px]">
                    <Select
                      value={p.metodo}
                      onValueChange={(v) => updatePago(idx, { metodo: v })}
                    >
                      <SelectTrigger className="w-40 bg-transparent border border-neutral-300 h-8 px-2 text-[11px]">
                        <SelectValue placeholder="Medio" />
                      </SelectTrigger>
                      <SelectContent>
                        {(catalogs?.metodosPago ||
                          FALLBACK_CATALOGS.metodosPago
                        ).map((op) => (
                          <SelectItem key={op} value={op}>
                            {op}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={p.monto}
                      onChange={(e) => updatePago(idx, { monto: e.target.value })}
                      placeholder="$"
                      className="w-24 h-8 bg-transparent border border-neutral-300 text-right text-[11px]"
                    />
                    {form.pagos.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removePago(idx)}
                        aria-label="Eliminar medio de pago"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                    {idx === form.pagos.length - 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={addPago}
                        aria-label="Agregar medio de pago"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-neutral-500 mt-1">
                Total pagos: ${totalPagos || 0}
                {totalPagos &&
                  totalFinal &&
                  totalPagos !== totalFinal && (
                    <span className="ml-2 text-[10px] text-red-500">
                      (≠ Total remito ${totalFinal})
                    </span>
                  )}
              </div>
            </div>

            {/* DNI */}
            <div className="md:col-span-6 border-b border-neutral-400/60 md:border-r p-3">
              <div className="text-[13px] font-bold tracking-wide">DNI</div>
              <Input
                value={form.dni}
                onChange={onInput("dni")}
                className="bg-transparent"
                placeholder="DNI"
              />
            </div>

            {/* Localidad */}
            <div className="md:col-span-6 border-b border-neutral-400/60 p-3">
              <div className="text-[13px] font-bold tracking-wide">
                PROVINCIA / LOCALIDAD
              </div>
              <Input
                value={form.localidad}
                onChange={onInput("localidad")}
                className="bg-transparent"
                placeholder="Mendoza"
              />
            </div>

            {/* Vendedor */}
            <div className="md:col-span-6 border-b border-neutral-400/60 md:border-r p-3">
              <div className="text-[13px] font-bold tracking-wide">
                VENDEDOR
              </div>
              <Select
                value={form.vendedor}
                onValueChange={onSelect("vendedor")}
              >
                <SelectTrigger className="w-full bg-transparent">
                  <SelectValue
                    placeholder={loadingCatalogs ? "Cargando..." : "Seleccionar..."}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(catalogs?.vendedores || FALLBACK_CATALOGS.vendedores).map(
                    (op) => (
                      <SelectItem key={op} value={op}>
                        {op}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Costo envío */}
            <div className="md:col-span-6 border-b border-neutral-400/60 p-3">
              <div className="text-[13px] font-bold tracking-wide">
                COSTO DE ENVÍO ($)
              </div>
              <Input
                type="number"
                value={form.envio}
                onChange={onInput("envio")}
                className="bg-transparent"
              />
            </div>

            {/* Condición */}
            <div className="md:col-span-6 border-b border-neutral-400/60 md:border-r p-3">
              <div className="text-[13px] font-bold tracking-wide">
                CONDICIÓN
              </div>
              <Select
                value={form.condicionCompra}
                onValueChange={onSelect("condicionCompra")}
              >
                <SelectTrigger className="w-full bg-transparent">
                  <SelectValue
                    placeholder={loadingCatalogs ? "Cargando..." : "Seleccionar..."}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(
                    catalogs?.condicionesCompra ||
                    FALLBACK_CATALOGS.condicionesCompra
                  ).map((op) => (
                    <SelectItem key={op} value={op}>
                      {op}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Estado */}
            <div className="md:col-span-6 border-b border-neutral-400/60 p-3">
              <div className="text-[13px] font-bold tracking-wide">ESTADO</div>
              <Select value={form.estado} onValueChange={onSelect("estado")}>
                <SelectTrigger className="w-full bg-transparent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(catalogs?.estados || FALLBACK_CATALOGS.estados).map(
                    (op) => (
                      <SelectItem key={op} value={op}>
                        {op}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Descuento */}
            <div className="md:col-span-6 border-b border-neutral-400/60 md:border-r p-3">
              <div className="text-[13px] font-bold tracking-wide">
                DESCUENTO
              </div>
              <Input
                placeholder="-10% o 5000"
                value={form.recargoDescuento}
                onChange={onInput("recargoDescuento")}
                className="bg-transparent"
              />
            </div>

            {/* Teléfono */}
            <div className="md:col-span-6 border-b border-neutral-400/60 p-3">
              <div className="text-[13px] font-bold tracking-wide">
                TELÉFONO
              </div>
              <Input
                value={form.telefono}
                onChange={onInput("telefono")}
                className="bg-transparent"
              />
            </div>

            {/* Detalle general */}
            <div className="md:col-span-12 border-b border-neutral-400/60 p-3">
              <div className="text-[13px] font-bold tracking-wide">
                DETALLE GENERAL
              </div>
              <Textarea
                rows={3}
                value={form.detalleGeneral}
                onChange={onTextarea("detalleGeneral")}
              />
            </div>
          </div>

          {/* TABLA ÍTEMS */}
          <div className="border-b border-neutral-700/70">
            <div className="overflow-auto">
              <table className="min-w-full w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: 40 }} /> {/* CÓDIGO */}
                  <col style={{ width: 110 }} /> {/* ARTÍCULO */}
                  <col style={{ width: 40 }} /> {/* P. UNIT. */}
                  {BASE_SIZES.map((size) => (
                    <col key={`base-${size}`} style={{ width: 25 }} />
                  ))}
                  {showMoreSizes ? (
                    EXTRA_SIZES.map((size) => (
                      <col key={`extra-${size}`} style={{ width: 25 }} />
                    ))
                  ) : (
                    <col style={{ width: 30 }} />
                  )}
                  <col style={{ width: 30 }} /> {/* CANTIDAD */}
                  <col style={{ width: 30 }} /> {/* TOTAL */}
                  <col style={{ width: 10 }} /> {/* ACCIÓN */}
                </colgroup>

                <thead className="bg-neutral-100 border-y-2 border-neutral-700/80">
                  <tr className="[&>th]:border-r [&>th]:border-neutral-300 last:[&>th]:border-r-0">
                    <th className="px-2 py-2 text-left font-extrabold">
                      CÓDIGO
                    </th>
                    <th className="px-2 py-2 text-left font-extrabold">
                      ARTÍCULO
                    </th>
                    <th className="px-2 py-2 text-right font-extrabold">
                      P. UNIT.
                    </th>
                    {BASE_SIZES.map((s) => (
                      <th
                        key={s}
                        className="px-1 py-2 text-center font-extrabold"
                      >
                        {s}
                      </th>
                    ))}
                    {showMoreSizes ? (
                      EXTRA_SIZES.map((s) => (
                        <th
                          key={s}
                          className="px-1 py-2 text-center font-extrabold"
                        >
                          {s}
                        </th>
                      ))
                    ) : (
                      <th className="px-0 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setShowMoreSizes(true)}
                          className="mx-auto flex h-5 w-5 items-center justify-center rounded-sm border border-neutral-400 text-[10px] leading-none"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </th>
                    )}
                    <th className="px-1 py-2 text-center font-extrabold">
                      CANT.
                    </th>
                    <th className="px-1 py-2 text-right font-extrabold">
                      TOTAL
                    </th>
                    <th className="px-1 py-2 text-center font-extrabold" />
                  </tr>
                </thead>

                <tbody>
                  {form.items.map((it, idx) => (
                    <tr
                      key={idx}
                      className="border-b last:border-0 [&>td]:border-r [&>td]:border-neutral-200 last:[&>td]:border-r-0"
                    >
      {/* CÓDIGO */}
<td className="px-2 py-2">
  <Input
    value={it.sku || ""}
    onChange={(e: InputChange) => {
      const sku = e.target.value;
      updateItem(idx, { sku });

      const meta = parseSkuMeta(sku);

      // 👉 Solo autogenerar si tenemos base + owner (SCNL, etc.)
      if (looksLikeBase(sku) && meta.base && meta.owner) {
        SIZE_LIST.forEach((t) => {
          setSkuForTalle(idx, t, buildSku(meta.base!, t, meta.owner!));
        });
      }

      // 👉 Si NO hay owner, solo buscar sugerencias
      if (sku.length >= 2) {
        searchStock(idx, { q: sku });
        lookupSkuDebounced(idx, sku);
      }
    }}
    onBlur={(e) => {
      const val = e.currentTarget.value.trim();
      if (val) lookupSkuImmediate(idx, val);
    }}
    placeholder="Código"
    className="bg-transparent h-8"
    list={`sku-list-${idx}`}
  />

  <datalist id={`sku-list-${idx}`}>
    {(sugsByRow[idx] || []).map((s) => (
      <option key={s.sku} value={s.sku}>
        {s.articulo}
      </option>
    ))}
  </datalist>
</td>



                      {/* ARTÍCULO */}
                      <td className="px-2 py-2">
                        <Input
                          value={it.articulo || ""}
                          onChange={(e: InputChange) => {
                            const articulo = e.target.value;
                            updateItem(idx, { articulo });
                            if (articulo && articulo.length >= 2)
                              searchStock(idx, { articulo });
                          }}
                          placeholder="Artículo"
                          className="bg-transparent h-8"
                          list={`art-list-${idx}`}
                        />
                        <datalist id={`art-list-${idx}`}>
                          {[...new Set((sugsByRow[idx] || []).map((r) => r.articulo))].map(
                            (a) => (
                              <option key={a} value={a} />
                            )
                          )}
                        </datalist>
                      </td>

                      {/* P. UNIT. */}
                      <td className="px-2 py-2 text-right">
                        <Input
                          type="number"
                          value={it.precioUnitario}
                          onChange={(e: InputChange) =>
                            updateItem(idx, {
                              precioUnitario: Number(
                                (e.target as HTMLInputElement).value
                              ),
                            })
                          }
                          className="bg-transparent text-right h-8"
                        />
                      </td>

                      {/* TALLES base */}
                      {BASE_SIZES.map((t) => (
                        <td key={t} className="px-1 py-2 text-center">
                          <Input
                            type="number"
                            value={it.talles?.[t] ?? 0}
                            onChange={(e: InputChange) => {
                              const val = Number(
                                (e.target as HTMLInputElement).value
                              );
                              updateTalle(idx, t, val);
                              if (val > 0) {
                                const meta = parseSkuMeta(it.sku || "");
                                if (meta.base) {
                                  setSkuForTalle(
                                    idx,
                                    t,
                                    buildSku(meta.base, t, meta.owner)
                                  );
                                } else if (
                                  (it.articulo || "").trim() &&
                                  GS_URL
                                ) {
                                  if (debounceRef.current[idx])
                                    clearTimeout(debounceRef.current[idx]);
                                  debounceRef.current[idx] = setTimeout(
                                    async () => {
                                      try {
                                        const res = await fetch(GS_URL, {
                                          method: "POST",
                                          headers: {
                                            "Content-Type":
                                              "text/plain;charset=UTF-8",
                                          },
                                          body: JSON.stringify({
                                            action: "searchStock",
                                            articulo: it.articulo,
                                            talle: t,
                                            limit: 1,
                                          }),
                                        });
                                        const json = await res.json();
                                        const first: StockRow | undefined =
                                          json?.ok &&
                                          Array.isArray(json.data)
                                            ? json.data[0]
                                            : undefined;
                                        if (first?.sku)
                                          setSkuForTalle(idx, t, first.sku);
                                      } catch {
                                        // silencio
                                      }
                                    },
                                    250
                                  );
                                }
                              }
                            }}
                            className="bg-transparent text-center h-8 w-14 mx-auto"
                          />
                        </td>
                      ))}

                      {/* TALLES extra o celda del botón + */}
                      {showMoreSizes ? (
                        EXTRA_SIZES.map((t) => (
                          <td key={t} className="px-1 py-2 text-center">
                            <Input
                              type="number"
                              value={it.talles?.[t] ?? 0}
                              onChange={(e: InputChange) => {
                                const val = Number(
                                  (e.target as HTMLInputElement).value
                                );
                                updateTalle(idx, t, val);
                                if (val > 0) {
                                  const meta = parseSkuMeta(it.sku || "");
                                  if (meta.base) {
                                    setSkuForTalle(
                                      idx,
                                      t,
                                      buildSku(meta.base, t, meta.owner)
                                    );
                                  } else if (
                                    (it.articulo || "").trim() &&
                                    GS_URL
                                  ) {
                                    if (debounceRef.current[idx])
                                      clearTimeout(
                                        debounceRef.current[idx]
                                      );
                                    debounceRef.current[idx] = setTimeout(
                                      async () => {
                                        try {
                                          const res = await fetch(GS_URL, {
                                            method: "POST",
                                            headers: {
                                              "Content-Type":
                                                "text/plain;charset=UTF-8",
                                            },
                                            body: JSON.stringify({
                                              action: "searchStock",
                                              articulo: it.articulo,
                                              talle: t,
                                              limit: 1,
                                            }),
                                          });
                                          const json = await res.json();
                                          const first: StockRow | undefined =
                                            json?.ok &&
                                            Array.isArray(json.data)
                                              ? json.data[0]
                                              : undefined;
                                          if (first?.sku)
                                            setSkuForTalle(idx, t, first.sku);
                                        } catch {
                                          // silencio
                                        }
                                      },
                                      250
                                    );
                                  }
                                }
                              }}
                              className="bg-transparent text-center h-8 w-14 mx-auto"
                            />
                          </td>
                        ))
                      ) : (
                        <td className="px-0 py-2 text-center align-middle" />
                      )}

                      {/* Cantidad */}
                      <td className="px-1 py-2 text-center font-medium tabular-nums">
                        {rowCantidad(it)}
                      </td>

                      {/* Total */}
                      <td className="px-1 py-2 text-right font-medium tabular-nums">
                        {rowSubtotal(it)}
                      </td>

                      {/* Acción (X) */}
                      <td className="px-1 py-2 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeItem(idx)}
                          aria-label="Eliminar ítem"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4">
              <Button onClick={addItem} variant="secondary" className="gap-2">
                <Plus className="h-4 w-4" /> Agregar ítem
              </Button>
              {showMoreSizes && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-3 text-[10px] px-2 py-1 h-7"
                  onClick={() => setShowMoreSizes(false)}
                >
                  Ocultar XXL/XXXL
                </Button>
              )}
            </div>
          </div>

          {/* FOOTER */}
          <div className="grid grid-cols-1 md:grid-cols-12">
            <div className="md:col-span-8 p-4">
              <Button
                variant="outline"
                onClick={handleDownloadPDF}
                className="mr-3"
              >
                Descargar PDF
              </Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar en Sheets
              </Button>
              {msg && (
                <div className="mt-2 text-sm text-neutral-600">{msg}</div>
              )}
            </div>

            <div className="md:col-span-4 border-l-4 border-neutral-700/70 p-4">
              <div className="flex justify-between py-2">
                <div className="font-bold">TOTAL PRENDAS</div>
                <div className="tabular-nums">{prendas}</div>
              </div>
              <div className="flex justify-between py-2">
                <div className="font-bold">SUBTOTAL</div>
                <div className="tabular-nums">${calcSubtotal}</div>
              </div>
              <div className="flex justify-between py-2">
                <div className="font-bold">DESCUENTO</div>
                <div className="tabular-nums">
                  {form.recargoDescuento || 0}
                </div>
              </div>
              <div className="flex justify-between py-2">
                <div className="font-bold">ENVÍO</div>
                <div className="tabular-nums">${form.envio || 0}</div>
              </div>
              <div className="flex justify-between py-2 text-lg">
                <div className="font-black">TOTAL</div>
                <div className="font-black tabular-nums">
                  ${totalFinal}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorRemitos;
