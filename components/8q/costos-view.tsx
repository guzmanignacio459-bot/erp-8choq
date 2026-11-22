import { leerImporte } from "@/lib/8q/pilar-escritura";

const DUENOS = ["8Q", "SCNL"] as const;

export function CostosPreparacion() {
  return (
    <section className="max-w-xl space-y-4 text-white">
      <h2 className="text-2xl font-semibold tracking-tight">Productos y costos</h2>
      <p className="text-sm leading-6 text-white/70">
        No hay costo de fabricación cargado. Un campo vacío no es cero y los 16.000 no se usan. 8Q y SCNL tienen vigencias distintas, aunque el SKU se parezca.
      </p>
      <form action="/api/8q/costos" method="post" className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <label className="grid gap-1 text-xs text-white/50">
          SKU
          <input name="sku" required className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white" />
        </label>
        <label className="grid gap-1 text-xs text-white/50">
          Dueño
          <select name="dueno" className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white">
            {DUENOS.map((dueno) => <option key={dueno}>{dueno}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-white/50">
          Vigente desde
          <input type="date" name="vigente_desde" required className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white" />
        </label>
        {([
          ["materia_prima", "Materia prima y tela"],
          ["mano_obra", "Mano de obra"],
          ["avios", "Avíos e insumos"],
          ["otros", "Otros costos directos"],
          ["costo_unitario", "Costo unitario"],
        ] as const).map(([name, label]) => (
          <label key={name} className="grid gap-1 text-xs text-white/50">
            {label}
            <input name={name} inputMode="decimal" placeholder="Vacío, no cero" className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white" />
          </label>
        ))}
        <button type="submit" className="h-11 rounded-xl bg-white px-4 text-sm font-semibold text-black">Guardar vigencia</button>
        <p className="text-xs text-white/45">La tabla todavía no existe. Guardar no escribe en Neon, en la planilla ni en el stock.</p>
      </form>
    </section>
  );
}

export function importesDelFormulario(form: FormData): Record<string, number | null> {
  return {
    materia_prima: leerImporte(String(form.get("materia_prima") ?? "")),
    mano_obra: leerImporte(String(form.get("mano_obra") ?? "")),
    avios: leerImporte(String(form.get("avios") ?? "")),
    otros: leerImporte(String(form.get("otros") ?? "")),
    costo_unitario: leerImporte(String(form.get("costo_unitario") ?? "")),
  };
}
