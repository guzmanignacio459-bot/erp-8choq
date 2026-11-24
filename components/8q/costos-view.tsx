"use client";

import { useMemo, useState } from "react";

import type { ProductoCosto } from "@/lib/8q/costos";

const DUENOS = ["8Q", "SCNL"] as const;

function dinero(valor: number | null): string {
  if (valor == null) return "Sin dato";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(valor);
}

export function CostosPreparacion({ productos, tablas }: { productos: ProductoCosto[]; tablas: boolean }) {
  const [busqueda, setBusqueda] = useState("");
  const [dueno, setDueno] = useState("todos");
  const [costo, setCosto] = useState("todos");
  const [modalidad, setModalidad] = useState<"directo" | "desglosado">("directo");
  const [elegido, setElegido] = useState<ProductoCosto | null>(null);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [conjunto, setConjunto] = useState(false);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return productos.filter((producto) => {
      if (dueno !== "todos" && producto.dueno !== dueno) return false;
      if (costo === "sin" && producto.conCosto) return false;
      if (costo === "con" && !producto.conCosto) return false;
      if (!texto) return true;
      return producto.nombre.toLowerCase().includes(texto) || producto.sku.toLowerCase().includes(texto);
    });
  }, [productos, busqueda, dueno, costo]);

  const variantes = useMemo(() => {
    if (!elegido) return [];
    return productos.filter((producto) => producto.dueno === elegido.dueno && producto.nombre === elegido.nombre && producto.sku !== elegido.sku);
  }, [productos, elegido]);

  function elegir(producto: ProductoCosto) {
    setElegido(producto);
    setMarcadas([]);
    setConjunto(false);
  }

  function marcar(sku: string) {
    setMarcadas((actual) => actual.includes(sku) ? actual.filter((item) => item !== sku) : [...actual, sku]);
  }

  return (
    <div className="space-y-6 text-white">
      <section className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Productos y costos</h2>
        <p className="max-w-3xl text-sm leading-6 text-white/70">
          No hay costo de fabricación cargado. Un campo vacío no es cero y los 16.000 no se usan. 8Q y SCNL no comparten vigencia.
          Cada corrección es una vigencia nueva. {tablas ? "Las tablas ya existen." : "Las tablas todavía no existen: guardar no escribe."}
          La copia de PILAR no trae categoría.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <label className="grid gap-1 text-xs text-white/50 md:col-span-2">
          Buscar por nombre o SKU
          <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white" />
        </label>
        <label className="grid gap-1 text-xs text-white/50">
          Dueño
          <select value={dueno} onChange={(event) => setDueno(event.target.value)} className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white">
            <option value="todos">Todos</option>
            {DUENOS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-white/50">
          Costo
          <select value={costo} onChange={(event) => setCosto(event.target.value)} className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white">
            <option value="todos">Todos</option>
            <option value="sin">Sin costo</option>
            <option value="con">Con costo</option>
          </select>
        </label>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-white/40">
              <tr>
                <th className="px-3 py-3 font-medium">Producto</th>
                <th className="px-3 py-3 font-medium">SKU</th>
                <th className="px-3 py-3 font-medium">Dueño</th>
                <th className="px-3 py-3 font-medium">Unidades</th>
                <th className="px-3 py-3 font-medium">Neto</th>
                <th className="px-3 py-3 font-medium">Margen</th>
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, 80).map((producto) => (
                <tr key={`${producto.dueno}:${producto.sku}`} className="border-t border-white/10">
                  <td className="px-3 py-3">
                    <button type="button" onClick={() => elegir(producto)} className="text-left hover:underline">{producto.nombre}</button>
                  </td>
                  <td className="px-3 py-3 text-white/70">{producto.sku}</td>
                  <td className="px-3 py-3">{producto.dueno}</td>
                  <td className="px-3 py-3">{producto.unidades}</td>
                  <td className="px-3 py-3">{dinero(producto.neto)}</td>
                  <td className="px-3 py-3 text-white/50">No se calcula</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-3 text-xs text-white/45">{visibles.length} variantes, ordenadas por unidades vendidas. El margen espera el costo. La contribución total no se muestra como completa.</p>
        </div>

        <form action="/api/8q/costos" method="post" className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-medium">Nueva vigencia</p>
          <div className="flex gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="modalidad" value="directo" checked={modalidad === "directo"} onChange={() => setModalidad("directo")} />Total directo</label>
            <label className="flex items-center gap-2"><input type="radio" name="modalidad" value="desglosado" checked={modalidad === "desglosado"} onChange={() => setModalidad("desglosado")} />Desglosado</label>
          </div>
          <label className="grid gap-1 text-xs text-white/50">
            SKU
            <input name="sku" value={elegido?.sku ?? ""} onChange={(event) => setElegido((actual) => actual ? { ...actual, sku: event.target.value } : { dueno: "8Q", sku: event.target.value, nombre: event.target.value, unidades: 0, neto: null, conCosto: false })} required className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white" />
          </label>
          <label className="grid gap-1 text-xs text-white/50">
            Dueño
            <select name="dueno" value={elegido?.dueno ?? "8Q"} onChange={(event) => setElegido((actual) => ({ ...(actual ?? { sku: "", nombre: "", unidades: 0, neto: null, conCosto: false }), dueno: event.target.value }))} className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white">
              {DUENOS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-white/50">
            Vigente desde
            <input type="date" name="vigente_desde" required className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white" />
          </label>
          {modalidad === "desglosado" ? (
            <>
              {([
                ["materia_prima", "Materia prima"],
                ["mano_obra", "Mano de obra"],
                ["avios", "Avíos"],
                ["otros", "Otros costos directos"],
              ] as const).map(([name, label]) => (
                <label key={name} className="grid gap-1 text-xs text-white/50">
                  {label}
                  <input name={name} inputMode="decimal" placeholder="Vacío, no cero" className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white" />
                </label>
              ))}
            </>
          ) : (
            <label className="grid gap-1 text-xs text-white/50">
              Costo unitario total
              <input name="costo_unitario" inputMode="decimal" placeholder="Vacío, no cero" required className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white" />
            </label>
          )}
          {variantes.length > 0 ? (
            <fieldset className="grid gap-2 rounded-xl border border-white/10 p-3">
              <legend className="px-1 text-xs text-white/50">Variantes del mismo nombre. Ninguna sale marcada.</legend>
              {variantes.map((variante) => (
                <label key={variante.sku} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="sku_variante" value={variante.sku} checked={marcadas.includes(variante.sku)} onChange={() => marcar(variante.sku)} />
                  {variante.sku} · {variante.unidades} u.
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="conjunto" value="si" checked={conjunto} onChange={(event) => setConjunto(event.target.checked)} />
                Aplicar esta vigencia solo a las variantes marcadas
              </label>
            </fieldset>
          ) : null}
          <button type="submit" className="h-11 rounded-xl bg-white px-4 text-sm font-semibold text-black">Guardar vigencia</button>
          <p className="text-xs text-white/45">Guardar no escribe mientras las tablas no existan. No modifica el neto ni el stock.</p>
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 p-4">
        <h3 className="text-lg font-semibold">Historial de costos</h3>
        <p className="mt-2 text-sm text-white/60">Todavía no hay vigencias. Cuando existan, cada fecha queda visible y una edición agrega otra fecha, sin borrar la anterior.</p>
      </section>
    </div>
  );
}

