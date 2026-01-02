// app/remitos/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Plus, ArrowRight, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const WEBHOOK = "/api/remitos";

type RemitoListado = {
  id: string;
  fecha: string;
  nombre: string;
  metodoPago: string;
  estado: string;
  total: number;
};

export default function RemitosPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [remitos, setRemitos] = useState<RemitoListado[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadRemitos = async () => {
    try {
      setLoading(true);
      const res = await fetch(WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listRemitos" }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "Error al cargar remitos");

      const rows: RemitoListado[] = (json.data ?? []).map((r: any) => ({
        id: String(r.id ?? ""),
        fecha: r.fecha ?? "",
        nombre: r.nombre ?? "",
        metodoPago: r.metodoPago ?? "",
        estado: r.estado ?? "",
        total: Number(r.totalFinal ?? r.total ?? 0),
      }));

      setRemitos(rows);
    } catch (e: any) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Error al cargar",
        description: String(e?.message ?? e),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRemitos();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return remitos;
    return remitos.filter((r) =>
      [
        r.id,
        r.fecha,
        r.nombre,
        r.metodoPago,
        r.estado,
        r.total?.toString() ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [remitos, search]);

  const handleContinuar = (remito: RemitoListado) => {
    if (!remito.id) {
      toast({
        variant: "destructive",
        title: "Sin ID",
        description: "Este remito no tiene ID asignado.",
      });
      return;
    }
    router.push(`/remitos/${remito.id}`);
  };

  const handleMarcarPagado = async (remito: RemitoListado) => {
    if (!remito.id) {
      toast({
        variant: "destructive",
        title: "Sin ID",
        description: "Este remito no tiene ID asignado.",
      });
      return;
    }

    setBusyId(remito.id);
    try {
      const res = await fetch(WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setEstado",
          id: remito.id,
          estado: "Pagado",
        }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "No se pudo marcar como pagado");

      toast({
        title: "✅ Remito actualizado",
        description: `El remito #${remito.id} fue marcado como Pagado.`,
      });

      await loadRemitos();
    } catch (e: any) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Error",
        description: String(e?.message ?? e),
      });
    } finally {
      setBusyId(null);
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

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-semibold">📋 Listado de Remitos</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadRemitos} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" /> Actualizando…
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
              </>
            )}
          </Button>
          {/* 👇 AHORA SÍ VA AL FORMULARIO NUEVO REMITO */}
          <Button onClick={() => router.push("/")} className="gap-2">
            <Plus className="w-4 h-4" /> Nuevo Remito
          </Button>
        </div>
      </div>

      <div>
        <Input
          placeholder="Buscar por cliente, ID, método o estado..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xl"
        />
      </div>

      <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 border-b">
            <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
              <th>ID</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Método de Pago</th>
              <th>Estado</th>
              <th className="text-right">Total</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.id}
                className="border-b last:border-0 hover:bg-neutral-50 transition-colors"
              >
                <td className="px-3 py-2 break-all">{r.id || "-"}</td>
                <td className="px-3 py-2">{r.fecha || "-"}</td>
                <td className="px-3 py-2">{r.nombre || "-"}</td>
                <td className="px-3 py-2">{r.metodoPago || "-"}</td>
                <td className="px-3 py-2">
                  {r.estado === "Pagado" ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs font-semibold">
                      Pagado
                    </span>
                  ) : r.estado === "Pendiente" ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-semibold">
                      Pendiente
                    </span>
                  ) : r.estado === "Anulado" ? (
                    <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-semibold">
                      Anulado
                    </span>
                  ) : (
                    r.estado || "-"
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatMoney(Number(r.total || 0))}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleContinuar(r)}
                      className="gap-1"
                    >
                      <ArrowRight className="w-4 h-4" />
                      Continuar
                    </Button>
                    <Button
                      size="sm"
                      disabled={busyId === r.id || r.estado === "Pagado"}
                      onClick={() => handleMarcarPagado(r)}
                      className="gap-1"
                    >
                      {busyId === r.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      Marcar pagado
                    </Button>
                  </div>
                </td>
              </tr>
            ))}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-neutral-500">
                  No se encontraron remitos con ese filtro.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                  <div className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando remitos…
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
