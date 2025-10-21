"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils"; // opcional: si no tenés util, reemplaza cn(...) por un join de clases.
import { Remito, useRemitosStore } from "@/store/remitos";

function InlineName({
  value,
  onChange,
}: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  if (!editing) {
    return (
      <button
        className="truncate hover:underline"
        onClick={() => setEditing(true)}
        title="Editar nombre de la pestaña"
      >
        {value || "Sin nombre"}
      </button>
    );
  }
  return (
    <input
      ref={inputRef}
      className="bg-transparent border-b border-gray-300 focus:outline-none w-40"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") setEditing(false);
      }}
    />
  );
}

export default function RemitoTabs() {
  const {
    remitos,
    activeId,
    setActive,
    addRemito,
    closeRemito,
    updateRemito,
    markPagado,
  } = useRemitosStore();

  const active = useMemo(
    () => remitos.find((r) => r.remitoId === activeId),
    [remitos, activeId]
  );

  return (
    <div className="w-full border-b bg-white sticky top-0 z-20">
      <div className="flex items-center overflow-x-auto gap-2 p-2">
        {remitos.map((r) => {
          const isActive = r.remitoId === activeId;
          return (
            <div
              key={r.remitoId}
              className={cn(
                "group flex items-center gap-2 rounded-xl px-3 py-2 border cursor-pointer select-none",
                isActive
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200"
              )}
              onClick={() => setActive(r.remitoId)}
              title={r.remitoId}
            >
              <span
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-md border",
                  r.pagado
                    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                    : "bg-amber-100 text-amber-700 border-amber-200"
                )}
              >
                {r.pagado ? "Pagado" : "Borrador"}
              </span>

              <InlineName
                value={r.nombreHoja || r.cliente?.nombre || r.remitoId}
                onChange={(v) => updateRemito(r.remitoId, { nombreHoja: v })}
              />

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  markPagado(r.remitoId, !r.pagado);
                }}
                className={cn(
                  "text-xs rounded-md px-2 py-1 border",
                  isActive
                    ? "border-white/30 hover:bg-white/10"
                    : "border-gray-300 hover:bg-white"
                )}
              >
                {r.pagado ? "Desmarcar" : "Marcar pagado"}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeRemito(r.remitoId);
                }}
                className={cn(
                  "opacity-60 hover:opacity-100 rounded-md px-1.5",
                  isActive ? "hover:bg-white/10" : "hover:bg-white"
                )}
                title="Cerrar pestaña"
              >
                ✕
              </button>
            </div>
          );
        })}

        <button
          className="ml-1 whitespace-nowrap rounded-xl px-3 py-2 border border-dashed hover:bg-gray-50"
          onClick={() => addRemito()}
        >
          + Nuevo remito
        </button>

        {active && (
          <div className="ml-auto mr-1 flex gap-2">
            <button
              className="rounded-lg border px-3 py-2 hover:bg-gray-50"
              onClick={() => window.print()}
              title="Imprimir / PDF"
            >
              Descargar PDF
            </button>
            <button
              className="rounded-lg border px-3 py-2 bg-black text-white hover:opacity-90"
              onClick={async () => {
                // Llama a tu endpoint existente para guardar en Sheets
                await fetch("/api/remitos", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(active),
                });
                alert("Guardado en Google Sheets ✅");
              }}
            >
              Guardar en Sheets
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
