import type { PilarSnapshot } from "@/lib/8q/pilar-finance-read";
import { metaAtrasada } from "@/lib/8q/meta-8q-cron";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

function formatMoney(value: number): string {
  return money.format(value);
}

function horaArgentina(iso: string | null): string {
  if (!iso) return "sin hora de lectura";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "sin hora de lectura";
  return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }).format(date);
}

function roasFinanciero(panel: PilarSnapshot["panel"]): string {
  if (!panel.meta.entraEnElNeto || panel.meta.gasto == null || panel.meta.gasto <= 0) return "No se calcula";
  return (panel.netoPrendas / panel.meta.gasto).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function notaEnvio(panel: PilarSnapshot["panel"], dueno: string): string {
  if (panel.envios.registrado8q == null) return "El envío de la cabecera no se parte por propietario.";
  if (dueno) return `Parte del Shipping Owner Cost asignada a las prendas de ${dueno}. El envío cobrado al cliente queda en la cabecera.`;
  const cliente = panel.envios.cobradoCliente == null ? "" : ` El cliente pagó ${formatMoney(panel.envios.cobradoCliente)} y eso no se resta.`;
  const sinEtiqueta = panel.envios.sinEtiqueta ? ` ${integer.format(panel.envios.sinEtiqueta)} remitos no tienen etiqueta.` : "";
  return `Importe registrado por PILAR desde Tiendanube.${cliente}${sinEtiqueta} La factura del correo sigue vacía.`;
}

export function PilarFilters({
  from,
  to,
  medio,
  dueno,
  methods,
  owners,
}: {
  from: string;
  to: string;
  medio: string;
  dueno: string;
  methods: string[];
  owners: string[];
}) {
  return (
    <form
      action="/8q/finanzas"
      method="get"
      className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2"
    >
      <label className="grid gap-1 text-xs text-white/50">
        Desde
        <input type="date" name="from" defaultValue={from} required className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white" />
      </label>
      <label className="grid gap-1 text-xs text-white/50">
        Hasta
        <input type="date" name="to" defaultValue={to} required className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white" />
      </label>
      <label className="grid gap-1 text-xs text-white/50">
        Canal de cobro
        <select name="medio" defaultValue={medio} className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white">
          <option value="">Todos</option>
          {methods.map((method) => (
            <option key={method} value={method}>{method}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-white/50">
        Propietario
        <select name="dueno" defaultValue={dueno} className="h-11 rounded-xl border border-white/10 bg-black px-3 text-sm text-white">
          <option value="">Todos</option>
          {owners.map((owner) => (
            <option key={owner} value={owner}>{owner}</option>
          ))}
        </select>
      </label>
      <button type="submit" className="h-11 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-black sm:col-span-2">
        Aplicar
      </button>
      <div className="flex gap-2 overflow-x-auto sm:col-span-2">
        <MonthLink href="/8q/finanzas?from=2026-08-01&to=2026-08-31" label="Agosto" />
        <MonthLink href="/8q/finanzas?from=2026-09-01&to=2026-09-30" label="Septiembre" />
        <MonthLink href="/8q/finanzas?from=2026-10-01&to=2026-10-31" label="Octubre" />
        <MonthLink href="/8q/finanzas?from=2026-11-01&to=2026-11-30" label="Noviembre" />
        <MonthLink href="/8q/finanzas?from=2026-10-01&to=2026-11-30" label="Oct y nov" />
      </div>
    </form>
  );
}

function MonthLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="shrink-0 rounded-full border border-white/10 px-3 py-2 text-xs text-white/80">
      {label}
    </a>
  );
}

function Metric({ label, value, note, source }: { label: string; value: string; note: string; source: string }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-xs uppercase tracking-[0.14em] text-white/45">{label}</h3>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm leading-6 text-white/70">{note}</p>
      <p className="mt-3 text-xs text-white/35">{source}</p>
    </article>
  );
}

export function PilarFinanceView({ data }: { data: PilarSnapshot }) {
  const panel = data.panel;
  return (
    <div className="space-y-5 text-white">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.18em] text-white/40">Rentabilidad</p>
        <h2 className="text-2xl font-semibold tracking-tight">Finanzas</h2>
      </div>

      <PilarFilters from={data.from} to={data.to} medio={data.medio} dueno={data.dueno} methods={data.methods} owners={data.owners} />

      <EstadoFuentes data={data} />

      <section className="rounded-3xl border border-orange-400/30 bg-gradient-to-b from-orange-500/15 to-transparent p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-orange-200/80">{panel.netoFinal == null ? "Neto antes de Meta" : "Neto después de cobros, logística y Meta"}</p>
        <p className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{formatMoney(panel.netoFinal ?? panel.netoAntesDeMeta)}</p>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
          Neto de prendas {formatMoney(panel.netoPrendas)}, menos el envío que PILAR registró a cargo de 8Q.
          El descuento, el costo de Mercado Pago y el 0,6 % de las transferencias ya están en ese neto y no se restan otra vez.
          {panel.netoFinal == null
            ? panel.meta.gasto == null
              ? " La publicidad no entra: no hay gasto de esta cuenta en el período."
              : " La publicidad se muestra al lado y no se resta: el filtro parte las ventas y el gasto de la cuenta no se puede partir."
            : " Este número ya resta la inversión que informó Meta. El costo de fabricación sigue afuera. No es la ganancia final."}
        </p>
        <p className="mt-3 text-xs text-white/45">
          {integer.format(data.remitos)} remitos · {integer.format(data.prendas)} prendas · {panel.cierra ? "la cuenta cierra" : "la cuenta no cierra"}
          {data.dueno ? ` · solo ${data.dueno}` : ""}
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Metric label="Ventas brutas" value={formatMoney(panel.ventasBrutas)} note="Precio de lista por cantidad, antes del descuento. No incluye envío." source="precio unitario × cantidad" />
        <Metric label="Costos Mercado Pago" value={formatMoney(panel.costosMp)} note={`Las transferencias no están acá. Su 0,6 % ya está en el neto: ${formatMoney(panel.deduccionTransferencia)}.`} source="mp_total_cost_asignado_real" />
        <Metric label="Transferencias" value={formatMoney(panel.deduccionTransferencia)} note="El 0,6 % ya está dentro del neto real de la prenda. No se resta otra vez." source="neto de prenda − neto real − costo de Mercado Pago" />
        <Metric
          label="Envíos pagados por 8Q"
          value={panel.envios.registrado8q == null ? "Sin datos suficientes" : formatMoney(panel.envios.registrado8q)}
          note={notaEnvio(panel, data.dueno)}
          source={panel.envios.corte === "prenda" ? "shipping_asignado" : "shipping_owner_cost"}
        />
        <Metric
          label="Inversión Meta Ads"
          value={panel.meta.gasto == null ? "Sin datos en el período" : formatMoney(panel.meta.gasto)}
          note={panel.meta.gasto == null
            ? "No hay días con gasto de 8Q INDUMENTARIA en este recorte. No se muestra cero."
            : `Compras ${integer.format(panel.meta.compras ?? 0)} · valor ${formatMoney(panel.meta.valorCompras ?? 0)} · impresiones ${panel.meta.impresiones == null ? "sin dato" : integer.format(panel.meta.impresiones)} · clics ${panel.meta.clics == null ? "sin dato" : integer.format(panel.meta.clics)}. Días cerrados ${data.metaGastoCerrado == null ? "sin dato" : formatMoney(data.metaGastoCerrado)}. Día en curso ${data.metaGastoAbierto == null ? "ninguno" : formatMoney(data.metaGastoAbierto)}. ${data.metaAviso}`}
          source={panel.meta.gasto == null ? "act_10202653580793000" : `act_10202653580793000 · ${data.metaZona} · sincronizado ${horaArgentina(data.metaLeidoEl)} · Neon`}
        />
        <Metric
          label="ROAS atribuido"
          value={panel.meta.roas == null ? "Sin dato" : String(panel.meta.roas)}
          note="Valor de compras que atribuye Meta ÷ gasto diario de la cuenta."
          source="purchase value / spend"
        />
        <Metric
          label="CPA"
          value={panel.meta.cpa == null ? "Sin compras" : formatMoney(panel.meta.cpa)}
          note="Gasto diario de la cuenta ÷ compras atribuidas."
          source="spend / purchases"
        />
        <Metric
          label="ROAS financiero"
          value={roasFinanciero(panel)}
          note="Neto real de prendas ÷ gasto diario de la cuenta. No usa el valor de compra de Meta. No se calcula si el filtro parte las ventas."
          source="neto_prenda_real / spend"
        />
        <Metric
          label="Costo de productos vendidos"
          value={panel.costoProductos.monto == null ? "Sin costo registrado" : formatMoney(panel.costoProductos.monto)}
          note={`${panel.costoProductos.unidadesConCosto === 0 ? "Ninguna unidad tiene costo registrado." : `${integer.format(panel.costoProductos.unidadesConCosto)} unidades con costo.`} ${integer.format(panel.costoProductos.unidadesSinCosto)} sin costo. Cobertura ${integer.format(Math.round(panel.costoProductos.cobertura * 100))} %. ${panel.costoProductos.estado === "completo" ? "Cobertura completa." : "No cierra la rentabilidad mientras falte una unidad."} Un vacío no es cero.`}
          source="pilar_prenda_costo, solo vigencias registradas"
        />
        <Metric
          label="Resultado después de costos directos"
          value={panel.resultadoDirecto == null ? "Incompleto" : formatMoney(panel.resultadoDirecto)}
          note="Aparece solo cuando todas las unidades tienen costo y la publicidad entra en el neto. No es la ganancia final."
          source="neto después de Meta − costo registrado"
        />
        <Metric label="Margen por producto" value="No se calcula" note="Falta el costo de cada variante. El precio de venta no se usa como costo." source="margen bloqueado" />
      </section>

      <p className="text-sm leading-6 text-white/55">
        Neto después de cobros, logística y Meta = neto real de prendas − logística registrada a cargo de 8Q − suma de los días publicitarios. Mercado Pago y el 0,6 % ya están en el neto real. El costo de fabricación y los impuestos publicitarios siguen pendientes. Cada día es de Los Ángeles, no de Argentina.
        {data.run ? ` Corrida ${data.run.id}.` : ""}
      </p>

      {data.metaSerie.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Inversión por día de Los Ángeles</h3>
          <p className="text-sm leading-6 text-white/55">Lectura {horaArgentina(data.metaLeidoEl)}, hora de Argentina. El día marcado sigue abierto en la cuenta y no es un día de Argentina.</p>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-xs uppercase text-white/40">
                <tr>
                  <th className="px-3 py-3 font-medium">Día publicitario</th>
                  <th className="px-3 py-3 font-medium">Gasto</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.metaSerie.map((dia) => (
                  <tr key={dia.dia} className="border-t border-white/10">
                    <td className="px-3 py-3">{dia.dia}</td>
                    <td className="px-3 py-3">{formatMoney(dia.gasto)}</td>
                    <td className="px-3 py-3">{dia.abierto ? "En curso" : "Cerrado"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data.metaCampanas.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Campañas con gasto</h3>
          <p className="text-sm leading-6 text-white/55">Suma de los días de cada campaña. Es un desglose: no se suma al gasto de la cuenta.</p>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase text-white/40">
                <tr>
                  <th className="px-3 py-3 font-medium">Campaña</th>
                  <th className="px-3 py-3 font-medium">Gasto</th>
                  <th className="px-3 py-3 font-medium">Compras</th>
                  <th className="px-3 py-3 font-medium">Valor</th>
                  <th className="px-3 py-3 font-medium">Impresiones</th>
                  <th className="px-3 py-3 font-medium">Clics</th>
                  <th className="px-3 py-3 font-medium">CPA</th>
                  <th className="px-3 py-3 font-medium">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {data.metaCampanas.map((campana) => (
                  <tr key={campana.id} className="border-t border-white/10">
                    <td className="px-3 py-3">{campana.nombre}</td>
                    <td className="px-3 py-3">{formatMoney(campana.gasto)}</td>
                    <td className="px-3 py-3">{integer.format(campana.compras)}</td>
                    <td className="px-3 py-3">{formatMoney(campana.valorCompras)}</td>
                    <td className="px-3 py-3">{integer.format(campana.impresiones)}</td>
                    <td className="px-3 py-3">{integer.format(campana.clics)}</td>
                    <td className="px-3 py-3">{campana.cpa == null ? "sin compras" : formatMoney(campana.cpa)}</td>
                    <td className="px-3 py-3">{campana.roas ?? "sin gasto"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 p-4">
        <h3 className="text-sm text-white/50">Total cobrado</h3>
        <p className="mt-2 text-2xl font-semibold">{formatMoney(data.cobros)}</p>
        <p className="mt-2 text-sm leading-6 text-white/60">
          {integer.format(data.cobroRemitos)} remitos acreditados en el período. Es otro recorte: no se suma ni se resta del neto de venta.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Ventas por fecha de venta</h3>
        <div className="overflow-x-auto rounded-erp border border-erp-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-erp-bg-elevated text-xs uppercase text-erp-fg-muted">
              <tr>
                <th className="px-3 py-3 font-medium">Día</th>
                <th className="px-3 py-3 font-medium">Remitos</th>
                <th className="px-3 py-3 font-medium">Ventas</th>
                <th className="px-3 py-3 font-medium">Prendas</th>
                <th className="px-3 py-3 font-medium">Descuentos</th>
                <th className="px-3 py-3 font-medium">Envíos</th>
              </tr>
            </thead>
            <tbody>
              {data.saleDays.map((day) => (
                <tr key={day.day} className="border-t border-erp-border-subtle">
                  <td className="px-3 py-3 font-mono text-xs">{day.day}</td>
                  <td className="px-3 py-3">{integer.format(day.remitos)}</td>
                  <td className="px-3 py-3">{formatMoney(day.ventas)}</td>
                  <td className="px-3 py-3">{integer.format(day.prendas)}</td>
                  <td className="px-3 py-3">{formatMoney(day.descuentos)}</td>
                  <td className="px-3 py-3">{formatMoney(day.envios)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Cobros por fecha de acreditación</h3>
        <div className="overflow-x-auto rounded-erp border border-erp-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-erp-bg-elevated text-xs uppercase text-erp-fg-muted">
              <tr>
                <th className="px-3 py-3 font-medium">Día</th>
                <th className="px-3 py-3 font-medium">Remitos</th>
                <th className="px-3 py-3 font-medium">Neto</th>
                <th className="px-3 py-3 font-medium">Costo de cobro</th>
              </tr>
            </thead>
            <tbody>
              {data.collectionDays.map((day) => (
                <tr key={day.day} className="border-t border-erp-border-subtle">
                  <td className="px-3 py-3 font-mono text-xs">{day.day}</td>
                  <td className="px-3 py-3">{integer.format(day.remitos)}</td>
                  <td className="px-3 py-3">{formatMoney(day.neto)}</td>
                  <td className="px-3 py-3">{formatMoney(day.costo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Pendientes</h3>
        {data.pending.length === 0 ? (
          <p className="text-sm text-erp-fg-muted">Ningún remito ni prenda del período quedó incompleto.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.pending.map((row) => (
              <li key={`${row.grano}-${row.sheetRow}`} className="rounded-erp border border-erp-border px-3 py-2">
                {row.grano} {row.idRemito}, fila {row.sheetRow}: {row.motivos}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Remitos de origen</h3>
        <p className="text-sm text-erp-fg-muted">Cada venta se puede seguir hasta el remito y la fila de la planilla.</p>
        <div className="max-h-[480px] overflow-auto rounded-erp border border-erp-border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="sticky top-0 bg-erp-bg-elevated text-xs uppercase text-erp-fg-muted">
              <tr>
                <th className="px-3 py-3 font-medium">Remito</th>
                <th className="px-3 py-3 font-medium">Fila</th>
                <th className="px-3 py-3 font-medium">Venta</th>
                <th className="px-3 py-3 font-medium">Acreditación</th>
                <th className="px-3 py-3 font-medium">Total</th>
                <th className="px-3 py-3 font-medium">Neto MP</th>
                <th className="px-3 py-3 font-medium">Prendas</th>
              </tr>
            </thead>
            <tbody>
              {data.traces.map((row) => (
                <tr key={`${row.idRemito}-${row.sheetRow}`} className="border-t border-erp-border-subtle">
                  <td className="px-3 py-3 font-mono text-xs">{row.idRemito}</td>
                  <td className="px-3 py-3">{row.sheetRow}</td>
                  <td className="px-3 py-3">{row.fechaVenta ?? "pendiente"}</td>
                  <td className="px-3 py-3">{row.acreditado ?? "sin acreditación"}</td>
                  <td className="px-3 py-3">{formatMoney(row.ventas)}</td>
                  <td className="px-3 py-3">{formatMoney(row.netoMp)}</td>
                  <td className="px-3 py-3">{integer.format(row.prendas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EstadoFuentes({ data }: { data: PilarSnapshot }) {
  const atrasada = metaAtrasada(data.metaLeidoEl, Date.now());
  const cobertura = (desde: string | null, hasta: string | null) =>
    desde && hasta ? `${desde} a ${hasta}` : "sin cobertura";
  return (
    <section className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm md:grid-cols-2">
      <p>
        <span className="text-white/45">PILAR. </span>
        No entra sola. Última copia {horaArgentina(data.run?.readAt ?? null)} · cobertura {cobertura(data.pilarDesde, data.pilarHasta)}.
      </p>
      <p>
        <span className="text-white/45">Meta. </span>
        Última lectura {horaArgentina(data.metaLeidoEl)} · cobertura {cobertura(data.metaDesde, data.metaHasta)}. {atrasada ? "Atrasada." : "Al día."}
        {data.metaDiaAbierto ? ` Día abierto ${data.metaDiaAbierto}.` : ""}
      </p>
      <p>
        <span className="text-white/45">Conexión. </span>
        Neon staging. {data.metaEstado ? `Meta ${data.metaEstado}.` : "Meta sin estado de corrida."}
      </p>
      <p>
        <span className="text-white/45">Fabricación. </span>
        {data.panel.costoProductos.unidadesConCosto > 0 && data.panel.costoProductos.unidadesConCosto === data.panel.costoProductos.unidades ? "Cubierta." : "Pendiente. No entra en el neto."}
      </p>
    </section>
  );
}

export function AccesoFinanzas({ rechazado }: { rechazado: boolean }) {
  return (
    <form action="/api/8q/acceso" method="post" className="mx-auto max-w-sm space-y-4 text-white">
      <h2 className="text-2xl font-semibold tracking-tight">Entrar a finanzas</h2>
      <p className="text-sm text-white/70">La clave queda en el servidor. Esta pantalla no muestra números hasta que coincida.</p>
      {rechazado ? <p className="text-sm text-orange-200">La clave no coincide.</p> : null}
      <input name="clave" type="password" autoComplete="current-password" required className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2" />
      <button type="submit" className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black">Entrar</button>
    </form>
  );
}

export function PilarFinanceUnavailable({
  reason,
  from,
  to,
  medio,
}: {
  reason: string;
  from: string;
  to: string;
  medio: string;
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Finanzas</h2>
      <PilarFilters from={from} to={to} medio={medio} dueno="" methods={[]} owners={[]} />
      <p className="rounded-erp border border-erp-border bg-erp-bg-card px-4 py-3 text-sm text-erp-info">{reason}</p>
    </div>
  );
}
