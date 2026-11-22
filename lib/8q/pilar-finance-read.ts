import { Prisma } from "@prisma/client";

import { secretoConfigurado } from "./acceso";

import { maskDatabaseUrl } from "@/lib/db/assert-staging";
import { getPrisma } from "@/lib/db/prisma";

import { elegirCorteMeta, type CampanaMetaLocal, type FilaMetaLocal } from "./meta-8q-corte";
import { diaCalendario } from "./meta-8q";
import { cents, resolvePilarPeriod } from "./pilar-finance";
import { armarPanel, type PanelRentabilidad } from "./rentabilidad";

const STAGING_HOST = "ep-spring-frog-acago22x-pooler.sa-east-1.aws.neon.tech";
const STAGING_DATABASE = "neondb";
const CUENTA_META = "act_10202653580793000";

export type PilarMonth = {
  mes: string;
  remitos: number;
  prendas: number;
  ventas: number;
  netoMp: number;
  descuentos: number;
  envios: number;
  netoPrenda: number;
  unidades8q: number;
  unidadesScnl: number;
  inferidas: number;
  pendientes: number;
};

export type PilarDay = {
  day: string;
  remitos: number;
  ventas: number;
  prendas: number;
  descuentos: number;
  envios: number;
};

export type PilarCollectionDay = {
  day: string;
  remitos: number;
  neto: number;
  costo: number;
};

export type PilarTrace = {
  idRemito: string;
  sheetRow: number;
  fechaVenta: string | null;
  acreditado: string | null;
  ventas: number;
  netoMp: number;
  prendas: number;
  completitud: string;
  tnLink: string;
};

export type PilarPending = {
  grano: string;
  idRemito: string;
  sheetRow: number;
  motivos: string;
};

export type PilarSnapshot = {
  from: string;
  to: string;
  medio: string;
  dueno: string;
  owners: string[];
  panel: PanelRentabilidad;
  methods: string[];
  remitos: number;
  prendas: number;
  ventas: number;
  netoMp: number;
  costoMp: number;
  descuentos: number;
  envios: number;
  netoPrenda: number;
  unidades8q: number;
  unidadesScnl: number;
  unidadesOtras: number;
  inferidas: number;
  pendientes: number;
  cobros: number;
  cobroRemitos: number;
  costoAcreditado: number;
  months: PilarMonth[];
  saleDays: PilarDay[];
  collectionDays: PilarCollectionDay[];
  traces: PilarTrace[];
  pending: PilarPending[];
  run: { id: string; status: string; readAt: string; sourceRows: number } | null;
  metaAviso: string;
  metaCampanas: CampanaMetaLocal[];
  metaLeidoEl: string | null;
  metaZona: string;
  metaDiaAbierto: string | null;
  metaGastoCerrado: number | null;
  metaGastoAbierto: number | null;
  metaSerie: { dia: string; gasto: number; abierto: boolean }[];
  pilarDesde: string | null;
  pilarHasta: string | null;
  metaDesde: string | null;
  metaHasta: string | null;
  metaEstado: string | null;
  pilarAutomatica: false;
};

export type PilarLoad =
  | { ok: false; reason: string; from: string; to: string; medio: string }
  | { ok: true; data: PilarSnapshot };

const BLOCKED_URL = [/topaz-iota/i, /vercel\.app/i, /\bprod\b/i, /production/i];

function gate(acceso: boolean): { ok: true } | { ok: false; reason: string } {
  const url = (process.env.DATABASE_URL ?? "").trim();
  if (BLOCKED_URL.some((pattern) => pattern.test(url))) {
    return { ok: false, reason: "La base configurada no es staging. No se consultó." };
  }
  if (!url) return { ok: false, reason: "No hay una base de staging configurada para leer." };
  let host = "";
  let database = "";
  try {
    const parsed = new URL(url.replace(/^postgres(ql)?:/, "http:"));
    host = parsed.hostname;
    database = parsed.pathname.replace(/^\//, "");
  } catch {
    return { ok: false, reason: "La base configurada no se puede leer." };
  }
  const meta = maskDatabaseUrl(url);
  if (meta.provider !== "neon-staging" || host !== STAGING_HOST || database !== STAGING_DATABASE) {
    return { ok: false, reason: "La base no es Neon staging. No se consultó." };
  }
  if (process.env.VERCEL) {
    if (!secretoConfigurado(process.env.EIGHTQ_DASHBOARD_SECRET)) {
      return { ok: false, reason: "El acceso del dashboard no está configurado." };
    }
    if (!acceso) return { ok: false, reason: "Hace falta entrar para ver las finanzas." };
  }
  return { ok: true };
}

function money(value: unknown): number {
  return cents(typeof value === "number" || typeof value === "string" ? value : 0) / 100;
}

function qty(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function text(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).slice(0, 10);
  return raw || null;
}

export async function loadPilarFinance(input: {
  from?: string;
  to?: string;
  medio?: string;
  dueno?: string;
  acceso?: boolean;
}): Promise<PilarLoad> {
  const resolved = resolvePilarPeriod(input);
  const dueno = input.dueno === "8Q" || input.dueno === "SCNL" ? input.dueno : "";
  if (!resolved.ok) return resolved;
  const allowed = gate(input.acceso === true);
  if (!allowed.ok) {
    return { ok: false, from: resolved.from, to: resolved.to, medio: resolved.medio, reason: allowed.reason };
  }

  const { from, to, medio } = resolved;
  const method = medio ? Prisma.sql`AND r.metodo_pago = ${medio}` : Prisma.empty;

  try {
    const prisma = getPrisma();
    const [sales, garments, collections, saleDays, collectionDays, garmentDays, methods, traces, pending, run] =
      await Promise.all([
        prisma.$queryRaw<{ remitos: number; ventas: string; neto: string; costo: string; pendientes: number }[]>(Prisma.sql`
          SELECT count(*)::int AS remitos,
                 coalesce(sum(r.total_final), 0)::text AS ventas,
                 coalesce(sum(r.mp_neto_real_orden), 0)::text AS neto,
                 coalesce(sum(r.mp_total_cost_real), 0)::text AS costo,
                 count(*) FILTER (WHERE r.completitud = 'pendiente')::int AS pendientes
          FROM pilar_remitos r
          WHERE r.fecha_venta >= ${from}::date
            AND r.fecha_venta <= ${to}::date
            ${method}
        `),
        prisma.$queryRaw<{
          prendas: number;
          unidades_8q: string;
          unidades_scnl: string;
          unidades_otras: string;
          inferidas: number;
          descuentos: string;
          envios: string;
          neto: string;
          pendientes: number;
        }[]>(Prisma.sql`
          SELECT count(*)::int AS prendas,
                 coalesce(sum(p.cantidad) FILTER (WHERE p.owner = '8Q'), 0)::text AS unidades_8q,
                 coalesce(sum(p.cantidad) FILTER (WHERE p.owner = 'SCNL'), 0)::text AS unidades_scnl,
                 coalesce(sum(p.cantidad) FILTER (WHERE p.owner NOT IN ('8Q', 'SCNL')), 0)::text AS unidades_otras,
                 count(*) FILTER (WHERE p.owner_inferred)::int AS inferidas,
                 coalesce(sum(p.descuento_asignado), 0)::text AS descuentos,
                 coalesce(sum(p.shipping_asignado), 0)::text AS envios,
                 coalesce(sum(p.neto_prenda), 0)::text AS neto,
                 count(*) FILTER (WHERE p.completitud = 'pendiente')::int AS pendientes
          FROM pilar_prendas p
          JOIN pilar_remitos r ON r.id_remito = p.id_remito AND r.duplicado = false
          WHERE r.fecha_venta >= ${from}::date
            AND r.fecha_venta <= ${to}::date
            ${method}
        `),
        prisma.$queryRaw<{ remitos: number; neto: string; costo: string }[]>(Prisma.sql`
          SELECT count(*)::int AS remitos,
                 coalesce(sum(r.mp_neto_real_orden), 0)::text AS neto,
                 coalesce(sum(r.mp_total_cost_real), 0)::text AS costo
          FROM pilar_remitos r
          WHERE r.mp_acreditado_fecha >= ${from}::date
            AND r.mp_acreditado_fecha <= ${to}::date
            ${method}
        `),
        prisma.$queryRaw<{ day: string; remitos: number; ventas: string }[]>(Prisma.sql`
          SELECT r.fecha_venta::text AS day,
                 count(*)::int AS remitos,
                 coalesce(sum(r.total_final), 0)::text AS ventas
          FROM pilar_remitos r
          WHERE r.fecha_venta >= ${from}::date
            AND r.fecha_venta <= ${to}::date
            ${method}
          GROUP BY 1
          ORDER BY 1
        `),
        prisma.$queryRaw<{ day: string; remitos: number; neto: string; costo: string }[]>(Prisma.sql`
          SELECT r.mp_acreditado_fecha::text AS day,
                 count(*)::int AS remitos,
                 coalesce(sum(r.mp_neto_real_orden), 0)::text AS neto,
                 coalesce(sum(r.mp_total_cost_real), 0)::text AS costo
          FROM pilar_remitos r
          WHERE r.mp_acreditado_fecha >= ${from}::date
            AND r.mp_acreditado_fecha <= ${to}::date
            ${method}
          GROUP BY 1
          ORDER BY 1
        `),
        prisma.$queryRaw<{ day: string; prendas: number; descuentos: string; envios: string }[]>(Prisma.sql`
          SELECT r.fecha_venta::text AS day,
                 count(*)::int AS prendas,
                 coalesce(sum(p.descuento_asignado), 0)::text AS descuentos,
                 coalesce(sum(p.shipping_asignado), 0)::text AS envios
          FROM pilar_prendas p
          JOIN pilar_remitos r ON r.id_remito = p.id_remito AND r.duplicado = false
          WHERE r.fecha_venta >= ${from}::date
            AND r.fecha_venta <= ${to}::date
            ${method}
          GROUP BY 1
        `),
        prisma.$queryRaw<{ metodo: string }[]>(Prisma.sql`
          SELECT r.metodo_pago AS metodo
          FROM pilar_remitos r
          WHERE r.fecha_venta >= ${from}::date
            AND r.fecha_venta <= ${to}::date
            AND r.metodo_pago IS NOT NULL
            AND r.metodo_pago <> ''
          GROUP BY 1
          ORDER BY count(*) DESC
          LIMIT 30
        `),
        prisma.$queryRaw<Record<string, string | number | null>[]>(Prisma.sql`
          SELECT r.id_remito, r.sheet_row, r.fecha_venta::text AS fecha_venta,
                 r.mp_acreditado_fecha::text AS acreditado,
                 coalesce(r.total_final, 0)::text AS ventas,
                 coalesce(r.mp_neto_real_orden, 0)::text AS neto,
                 (SELECT count(*)::int FROM pilar_prendas p WHERE p.id_remito = r.id_remito) AS prendas,
                 r.completitud, r.tn_link
          FROM pilar_remitos r
          WHERE r.fecha_venta >= ${from}::date
            AND r.fecha_venta <= ${to}::date
            ${method}
          ORDER BY r.fecha_venta, r.sheet_row
        `),
        prisma.$queryRaw<{ grano: string; id_remito: string; sheet_row: number; motivos: string }[]>(Prisma.sql`
          SELECT 'remito' AS grano, r.id_remito, r.sheet_row, r.pendiente_motivos AS motivos
          FROM pilar_remitos r
          WHERE r.fecha_venta >= ${from}::date
            AND r.fecha_venta <= ${to}::date
            AND r.completitud = 'pendiente'
            ${method}
          UNION ALL
          SELECT 'prenda', p.id_remito, p.sheet_row, p.pendiente_motivos
          FROM pilar_prendas p
          JOIN pilar_remitos r ON r.id_remito = p.id_remito
          WHERE r.fecha_venta >= ${from}::date
            AND r.fecha_venta <= ${to}::date
            AND p.completitud = 'pendiente'
            ${method}
          ORDER BY 1, 3
          LIMIT 40
        `),
        prisma.$queryRaw<{ id: string; status: string; read_at: string; source_rows: number }[]>(Prisma.sql`
          SELECT id, status, read_at::text AS read_at, source_rows
          FROM pilar_import_runs
          ORDER BY read_at DESC
          LIMIT 1
        `),
      ]);

    const ownerSql = dueno ? Prisma.sql`AND p.owner = ${dueno}` : Prisma.empty;
    const [panelRows, shippingRows, ownerRows] = await Promise.all([
      prisma.$queryRaw<{
        bruto: string;
        descuentos: string;
        neto: string;
        real: string;
        costo_mp: string;
        unidades: string;
        envio_asignado: string;
      }[]>(Prisma.sql`
        SELECT coalesce(sum(p.precio_unitario * p.cantidad), 0)::text AS bruto,
               coalesce(sum(p.descuento_asignado), 0)::text AS descuentos,
               coalesce(sum(p.neto_prenda), 0)::text AS neto,
               coalesce(sum(p.neto_prenda_real), 0)::text AS real,
               coalesce(sum(p.mp_total_cost_asignado_real), 0)::text AS costo_mp,
               coalesce(sum(p.cantidad), 0)::text AS unidades,
               coalesce(sum(p.shipping_asignado), 0)::text AS envio_asignado
        FROM pilar_prendas p
        JOIN pilar_remitos r ON r.id_remito = p.id_remito AND r.duplicado = false
        WHERE r.fecha_venta >= ${from}::date
          AND r.fecha_venta <= ${to}::date
          ${method}
          ${ownerSql}
      `),
      prisma.$queryRaw<{ cliente: string; ocho: string; correo: number; sin_etiqueta: number }[]>(Prisma.sql`
        SELECT coalesce(sum(r.shipping_customer_cost), 0)::text AS cliente,
               coalesce(sum(r.shipping_owner_cost), 0)::text AS ocho,
               count(*) FILTER (WHERE r.costo_envio IS NOT NULL OR r.costo_envio_owner IS NOT NULL)::int AS correo,
               count(*) FILTER (WHERE r.envio_owner IS NULL OR r.envio_owner = '')::int AS sin_etiqueta
        FROM pilar_remitos r
        WHERE r.duplicado = false
          AND r.fecha_venta >= ${from}::date
          AND r.fecha_venta <= ${to}::date
          ${method}
      `),
      prisma.$queryRaw<{ owner: string }[]>(Prisma.sql`
        SELECT DISTINCT p.owner
        FROM pilar_prendas p
        JOIN pilar_remitos r ON r.id_remito = p.id_remito AND r.duplicado = false
        WHERE r.fecha_venta >= ${from}::date
          AND r.fecha_venta <= ${to}::date
          ${method}
          AND p.owner IN ('8Q', 'SCNL')
        ORDER BY 1
      `),
    ]);
    const panelRow = panelRows[0];
    const shipping = shippingRows[0];
    const meta = await leerMetaNeon(prisma, from, to);
    const metaEntra = !dueno && !medio;
    const panel = armarPanel({
      bruto: money(panelRow?.bruto),
      descuentos: money(panelRow?.descuentos),
      netoPrenda: money(panelRow?.neto),
      netoReal: money(panelRow?.real),
      costoMp: money(panelRow?.costo_mp),
      envioCliente: dueno ? null : money(shipping?.cliente),
      envioRegistrado8q: dueno ? money(panelRow?.envio_asignado) : money(shipping?.ocho),
      sinEtiqueta: dueno ? null : qty(shipping?.sin_etiqueta),
      corteEnvio: dueno ? "prenda" : "cabecera",
      unidades: qty(panelRow?.unidades),
      unidadesConCosto: 0,
      metaGasto: meta.gasto,
      metaCompras: meta.compras,
      metaValor: meta.valorCompras,
      metaImpresiones: meta.impresiones,
      metaClics: meta.clics,
      metaCpa: meta.cpa,
      metaRoas: meta.roas,
      metaEntra,
    });

    const sale = sales[0];
    const garment = garments[0];
    const collection = collections[0];
    const byGarmentDay = new Map(garmentDays.map((row) => [row.day, row]));
    const monthRows = await monthDetail(prisma, from, to, medio);
    const [cobertura] = await prisma.$queryRaw<{
      pilar_desde: string | null;
      pilar_hasta: string | null;
      meta_desde: string | null;
      meta_hasta: string | null;
      meta_estado: string | null;
    }[]>(Prisma.sql`
      SELECT
        (SELECT min(fecha_venta)::text FROM pilar_remitos WHERE duplicado = false) AS pilar_desde,
        (SELECT max(fecha_venta)::text FROM pilar_remitos WHERE duplicado = false) AS pilar_hasta,
        (SELECT min(day)::text FROM meta_8q_insight_daily WHERE ad_account_id = ${CUENTA_META}) AS meta_desde,
        (SELECT max(day)::text FROM meta_8q_insight_daily WHERE ad_account_id = ${CUENTA_META}) AS meta_hasta,
        (SELECT last_status FROM meta_8q_sync_cursor WHERE ad_account_id = ${CUENTA_META}) AS meta_estado
    `);

    return {
      ok: true,
      data: {
        from,
        to,
        medio,
        dueno,
        owners: ownerRows.map((row) => row.owner),
        panel,
        methods: methods.map((row) => row.metodo).filter(Boolean),
        remitos: qty(sale?.remitos),
        prendas: qty(garment?.prendas),
        ventas: money(sale?.ventas),
        netoMp: money(sale?.neto),
        costoMp: money(sale?.costo),
        descuentos: money(garment?.descuentos),
        envios: money(garment?.envios),
        netoPrenda: money(garment?.neto),
        unidades8q: money(garment?.unidades_8q),
        unidadesScnl: money(garment?.unidades_scnl),
        unidadesOtras: money(garment?.unidades_otras),
        inferidas: qty(garment?.inferidas),
        pendientes: qty(sale?.pendientes) + qty(garment?.pendientes),
        cobros: money(collection?.neto),
        cobroRemitos: qty(collection?.remitos),
        costoAcreditado: money(collection?.costo),
        months: monthRows,
        saleDays: saleDays.map((row) => {
          const extra = byGarmentDay.get(row.day);
          return {
            day: row.day,
            remitos: qty(row.remitos),
            ventas: money(row.ventas),
            prendas: qty(extra?.prendas),
            descuentos: money(extra?.descuentos),
            envios: money(extra?.envios),
          };
        }),
        collectionDays: collectionDays.map((row) => ({
          day: row.day,
          remitos: qty(row.remitos),
          neto: money(row.neto),
          costo: money(row.costo),
        })),
        traces: traces.map((row) => ({
          idRemito: String(row.id_remito),
          sheetRow: Number(row.sheet_row),
          fechaVenta: text(row.fecha_venta),
          acreditado: text(row.acreditado),
          ventas: money(row.ventas),
          netoMp: money(row.neto),
          prendas: qty(row.prendas),
          completitud: String(row.completitud),
          tnLink: String(row.tn_link),
        })),
        pending: pending.map((row) => ({
          grano: row.grano,
          idRemito: row.id_remito,
          sheetRow: row.sheet_row,
          motivos: row.motivos,
        })),
        run: run[0]
          ? { id: run[0].id, status: run[0].status, readAt: run[0].read_at, sourceRows: run[0].source_rows }
          : null,
        metaAviso: meta.aviso,
        metaCampanas: meta.campanas,
        metaLeidoEl: meta.leidoEl,
        metaZona: meta.zona,
        metaDiaAbierto: meta.diaAbierto,
        metaGastoCerrado: meta.gastoCerrado,
        metaGastoAbierto: meta.gastoAbierto,
        metaSerie: meta.serie,
        pilarDesde: text(cobertura?.pilar_desde),
        pilarHasta: text(cobertura?.pilar_hasta),
        metaDesde: text(cobertura?.meta_desde),
        metaHasta: text(cobertura?.meta_hasta),
        metaEstado: cobertura?.meta_estado ? String(cobertura.meta_estado) : null,
        pilarAutomatica: false,
      },
    };
  } catch {
    return { ok: false, from, to, medio, reason: "No se pudo leer Neon staging." };
  }
}

async function leerMetaNeon(
  prisma: ReturnType<typeof getPrisma>,
  from: string,
  to: string
) {
  const vacio = elegirCorteMeta({}, from, to);
  try {
    const dias = await prisma.$queryRaw<{
      dia: string;
      gasto: string;
      impresiones: string | null;
      clics: string | null;
      compras: string | null;
      valor: string | null;
    }[]>(Prisma.sql`
      SELECT day::text AS dia,
             spend::text AS gasto,
             impressions::text AS impresiones,
             clicks::text AS clics,
             purchases::text AS compras,
             purchase_value::text AS valor
      FROM meta_8q_insight_daily
      WHERE ad_account_id = ${CUENTA_META}
        AND day >= ${from}::date
        AND day <= ${to}::date
      ORDER BY day
    `);
    const campanas = await prisma.$queryRaw<{
      dia: string;
      id: string;
      nombre: string | null;
      gasto: string;
      impresiones: string | null;
      clics: string | null;
      compras: string | null;
      valor: string | null;
    }[]>(Prisma.sql`
      SELECT day::text AS dia,
             campaign_id AS id,
             campaign_name AS nombre,
             spend::text AS gasto,
             impressions::text AS impresiones,
             clicks::text AS clics,
             purchases::text AS compras,
             purchase_value::text AS valor
      FROM meta_8q_campaign_daily
      WHERE ad_account_id = ${CUENTA_META}
        AND day >= ${from}::date
        AND day <= ${to}::date
    `);
    const cursor = await prisma.$queryRaw<{ leido: Date | null }[]>(Prisma.sql`
      SELECT updated_at AS leido
      FROM meta_8q_sync_cursor
      WHERE ad_account_id = ${CUENTA_META}
    `);
    const diario: FilaMetaLocal[] = dias.map((fila) => ({
      dia: fila.dia.slice(0, 10),
      gasto: money(fila.gasto),
      compras: qty(fila.compras),
      valorCompras: money(fila.valor),
      impresiones: qty(fila.impresiones),
      clics: qty(fila.clics),
    }));
    const detalle: FilaMetaLocal[] = campanas.map((fila) => ({
      dia: fila.dia.slice(0, 10),
      campanaId: fila.id,
      campanaNombre: fila.nombre,
      gasto: money(fila.gasto),
      compras: qty(fila.compras),
      valorCompras: money(fila.valor),
      impresiones: qty(fila.impresiones),
      clics: qty(fila.clics),
    }));
    const leido = cursor[0]?.leido;
    return elegirCorteMeta({
      diario,
      campanas: detalle,
      hoyCuenta: diaCalendario(new Date(), "America/Los_Angeles"),
      leidoEl: leido ? new Date(leido).toISOString() : undefined,
      zona: "America/Los_Angeles",
    }, from, to);
  } catch {
    return vacio;
  }
}

async function monthDetail(
  prisma: ReturnType<typeof getPrisma>,
  from: string,
  to: string,
  medio: string
): Promise<PilarMonth[]> {
  const method = medio ? Prisma.sql`AND r.metodo_pago = ${medio}` : Prisma.empty;
  const clean = await prisma.$queryRaw<Record<string, string | number>[]>(Prisma.sql`
    SELECT to_char(r.fecha_venta, 'YYYY-MM') AS mes,
           count(*)::int AS remitos,
           coalesce(sum(r.total_final), 0)::text AS ventas,
           coalesce(sum(r.mp_neto_real_orden), 0)::text AS neto_mp,
           count(*) FILTER (WHERE r.completitud = 'pendiente')::int AS pendientes_remito
    FROM pilar_remitos r
    WHERE r.fecha_venta >= ${from}::date
      AND r.fecha_venta <= ${to}::date
      AND r.duplicado = false
      ${method}
    GROUP BY 1
    ORDER BY 1
  `);
  const garment = await prisma.$queryRaw<Record<string, string | number>[]>(Prisma.sql`
    SELECT to_char(r.fecha_venta, 'YYYY-MM') AS mes,
           count(*)::int AS prendas,
           coalesce(sum(p.descuento_asignado), 0)::text AS descuentos,
           coalesce(sum(p.shipping_asignado), 0)::text AS envios,
           coalesce(sum(p.neto_prenda), 0)::text AS neto_prenda,
           coalesce(sum(p.cantidad) FILTER (WHERE p.owner = '8Q'), 0)::text AS unidades_8q,
           coalesce(sum(p.cantidad) FILTER (WHERE p.owner = 'SCNL'), 0)::text AS unidades_scnl,
           count(*) FILTER (WHERE p.owner_inferred)::int AS inferidas,
           count(*) FILTER (WHERE p.completitud = 'pendiente')::int AS pendientes
    FROM pilar_prendas p
    JOIN pilar_remitos r ON r.id_remito = p.id_remito AND r.duplicado = false
    WHERE r.fecha_venta >= ${from}::date
      AND r.fecha_venta <= ${to}::date
      ${method}
    GROUP BY 1
  `);
  const garments = new Map(garment.map((row) => [String(row.mes), row]));
  return clean.map((row) => {
    const extra = garments.get(String(row.mes));
    return {
      mes: String(row.mes),
      remitos: qty(row.remitos),
      prendas: qty(extra?.prendas),
      ventas: money(row.ventas),
      netoMp: money(row.neto_mp),
      descuentos: money(extra?.descuentos),
      envios: money(extra?.envios),
      netoPrenda: money(extra?.neto_prenda),
      unidades8q: money(extra?.unidades_8q),
      unidadesScnl: money(extra?.unidades_scnl),
      inferidas: qty(extra?.inferidas),
      pendientes: qty(row.pendientes_remito) + qty(extra?.pendientes),
    };
  });
}
