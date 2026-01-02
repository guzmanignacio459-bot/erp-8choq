// app/remitos/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, CheckCircle2, XCircle, Pencil } from "lucide-react";

const WEBHOOK = "/api/remitos";

type RemitoItem = {
  sku: string;
  articulo: string;
  talle: string;
  cantidad: number;
  precioUnitario: number;
  owner?: string;
};

type Remito = {
  id: string;
  fecha: string | Date;
  nombre: string;
  dni: string;
  localidad: string;
  telefono: string;
  transporte: string;
  metodoPago: string;
  vendedor: string;
  condicionCompra: string;
  totales: {
    prendas: number;
    subtotal: number;
    costoEnvio: number;
    totalFinal: number;
  };
  recargoDescuento: number | string;
  estado: string;
  detalleGeneral?: string;
  scnlItems?: number;
  items: RemitoItem[];
};

export default function RemitoDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id as string;

  const [remito, setRemito] = useState<Remito | null>(null);
  const [loading, setLoading] = useState(true);
  const [estadoBusy, setEstadoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (v: any) => {
    if (!v) return "-";
    try {
      const d = typeof v === "string" ? new Date(v) : v;
      if (isNaN(d.getTime())) return String(v);
      return d.toLocaleDateString("es-AR");
    } catch {
      return String(v);
    }
  };

  const formatMoney = (v: number) =>
    !isNaN(v)
      ? v.toLocaleString("es-AR", {
          style: "currency",
          currency: "ARS",
          minimumFractionDigits: 0,
        })
      : v;

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "getRemito", id }),
        });
        const json = await res.json();
        if (!json?.ok) {
          setError(json?.error || "No existe ese remito");
          setRemito(null);
        } else {
          setRemito(json.data as Remito);
        }
      } catch (e: any) {
        console.error(e);
        setError(e?.message || "Error al cargar el remito");
        setRemito(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleEstado = async (nuevo: "Pagado" | "Anulado") => {
    if (!remito) return;
    setEstadoBusy(true);
    try {
      const res = await fetch(WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setEstado", id: remito.id, estado: nuevo }),
      });
      const json = await res.json();
      if (!json?.ok) {
        alert("Error al actualizar estado: " + (json?.error || ""));
      } else {
        setRemito((r) => (r ? { ...r, estado: nuevo } : r));
      }
    } catch (e: any) {
      console.error(e);
      alert("Error al actualizar estado: " + (e?.message || e));
    } finally {
      setEstadoBusy(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-center py-16 text-neutral-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Cargando remito…
        </div>
      </main>
    );
  }

  if (error || !remito) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <div className="mx-auto max-w-xl rounded-lg border border-red-200 bg-red-50 px-6 py-4 text-red-700">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="w-5 h-5" />
            <span className="font-semibold">Error: {error || "No existe ese remito"}</span>
          </div>
          <Button onClick={() => router.push("/remitos")} variant="secondary">
            Volver
          </Button>
        </div>
      </main>
    );
  }

  const prendas = Number(remito.totales?.prendas ?? remito.items?.length ?? 0);
  const subtotal = Number(remito.totales?.subtotal ?? 0);
  const costoEnvio = Number(remito.totales?.costoEnvio ?? 0);
  const totalFinal = Number(remito.totales?.totalFinal ?? 0);

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => router.push("/remitos")}
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Button>
          <h1 className="text-2xl font-semibold">
            Remito <span className="font-mono">#{remito.id}</span>
          </h1>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* BOTÓN PARA IR AL FORMULARIO */}
          <Link href={`/?from=${encodeURIComponent(remito.id)}`}>
            <Button variant="outline" className="gap-2">
              <Pencil className="w-4 h-4" />
              Editar en formulario
            </Button>
          </Link>

          <Button
            onClick={() => handleEstado("Pagado")}
            disabled={estadoBusy || remito.estado === "Pagado"}
            className="gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Marcar Pagado
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleEstado("Anulado")}
            disabled={estadoBusy || remito.estado === "Anulado"}
            className="gap-2"
          >
            <XCircle className="w-4 h-4" />
            Anular
          </Button>
        </div>
      </div>

      {/* DATOS CABECERA */}
      <section className="rounded-xl border bg-white shadow-sm p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1 text-sm">
          <div>
            <span className="font-semibold">Fecha: </span>
            {formatDate(remito.fecha)}
          </div>
          <div>
            <span className="font-semibold">Cliente: </span>
            {remito.nombre}
          </div>
          <div>
            <span className="font-semibold">DNI: </span>
            {remito.dni || "-"}
          </div>
          <div>
            <span className="font-semibold">Teléfono: </span>
            {remito.telefono || "-"}
          </div>
        </div>
        <div className="space-y-1 text-sm">
          <div>
            <span className="font-semibold">Localidad: </span>
            {remito.localidad || "-"}
          </div>
          <div>
            <span className="font-semibold">Transporte: </span>
            {remito.transporte || "-"}
          </div>
          <div>
            <span className="font-semibold">Método de pago: </span>
            {remito.metodoPago || "-"}
          </div>
          <div>
            <span className="font-semibold">Vendedor: </span>
            {remito.vendedor || "-"}
          </div>
        </div>
      </section>

      {/* TABLA ÍTEMS + RESUMEN */}
      <section className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        <div className="lg:col-span-3 rounded-xl border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 border-b">
              <tr>
                <th className="px-3 py-2 text-left">SKU</th>
                <th className="px-3 py-2 text-left">Artículo</th>
                <th className="px-3 py-2 text-center">Talle</th>
                <th className="px-3 py-2 text-center">Cantidad</th>
                <th className="px-3 py-2 text-right">Precio Unitario</th>
              </tr>
            </thead>
            <tbody>
              {remito.items && remito.items.length > 0 ? (
                remito.items.map((it, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-mono text-xs break-all">{it.sku}</td>
                    <td className="px-3 py-2">{it.articulo}</td>
                    <td className="px-3 py-2 text-center">{it.talle}</td>
                    <td className="px-3 py-2 text-center">{it.cantidad}</td>
                    <td className="px-3 py-2 text-right">
                      {formatMoney(Number(it.precioUnitario || 0))}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                    Sin ítems registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border bg-white shadow-sm p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="font-semibold">Prendas:</span>
            <span>{prendas}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Subtotal:</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Envío:</span>
            <span>{formatMoney(costoEnvio)}</span>
          </div>
          <div className="border-t pt-2 mt-1 flex justify-between text-base">
            <span className="font-bold">Total:</span>
            <span className="font-bold">{formatMoney(totalFinal)}</span>
          </div>
        </div>
      </section>
    </main>
  );
}
