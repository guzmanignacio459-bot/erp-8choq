/**
 * Lectura de Meta para 8CHOQ. No importa el cliente de SHELBY ni sus variables.
 * Solo GET. No crea campañas, no cambia presupuestos y no agenda un cron.
 */

export const META_8Q_VERSION = "v27.0";
export const META_8Q_VARIABLES = [
  "META_8Q_APP_ID",
  "META_8Q_APP_SECRET",
  "META_8Q_ACCESS_TOKEN",
  "META_8Q_AD_ACCOUNT_ID",
] as const;

const INSIGHT_FIELDS = "spend,impressions,clicks,actions,action_values,cost_per_action_type,purchase_roas,account_currency,attribution_setting,date_start,date_stop";
const PURCHASE_TYPES = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];

export type Meta8qEnv = Record<string, string | undefined>;

export type Credenciales8q =
  | { ok: false; faltan: string[] }
  | { ok: true; appId: string; appSecret: string; token: string; accountId: string };

export type FilaMeta8q = {
  dia: string;
  campanaId: string | null;
  campanaNombre: string | null;
  gasto: number;
  impresiones: number | null;
  clics: number | null;
  compras: number | null;
  valorCompras: number | null;
  cpa: number | null;
  roas: number | null;
  moneda: string | null;
  atribucion: string | null;
};

export type ValidacionMeta8q =
  | { estado: "sin_conectar"; faltan: string[] }
  | { estado: "rechazada"; motivo: string }
  | { estado: "leida"; fila: FilaMeta8q };

type FetchLike = typeof fetch;

const REQUERIDAS_PARA_LEER = ["META_8Q_APP_ID", "META_8Q_ACCESS_TOKEN", "META_8Q_AD_ACCOUNT_ID"] as const;

export function credencialesMeta8q(env: Meta8qEnv): Credenciales8q {
  const faltan = REQUERIDAS_PARA_LEER.filter((name) => !env[name]?.trim());
  if (faltan.length) return { ok: false, faltan: [...faltan] };
  const accountId = normalizarCuenta(env.META_8Q_AD_ACCOUNT_ID ?? "");
  const token = (env.META_8Q_ACCESS_TOKEN ?? "").trim();
  if (!accountId || token.length < 20 || /\s/.test(token)) return { ok: false, faltan: ["META_8Q_ACCESS_TOKEN"] };
  return {
    ok: true,
    appId: (env.META_8Q_APP_ID ?? "").trim(),
    appSecret: (env.META_8Q_APP_SECRET ?? "").trim(),
    token,
    accountId,
  };
}

export function normalizarCuenta(value: string): string | null {
  const clean = value.trim();
  if (/^act_\d+$/.test(clean)) return clean;
  if (/^\d+$/.test(clean)) return `act_${clean}`;
  return null;
}

export function permisosDeLectura(permissions: { permission: string; status: string }[]): { ok: true } | { ok: false; motivo: "sin_ads_read" | "ads_management" } {
  const granted = permissions.filter((item) => item.status === "granted").map((item) => item.permission);
  if (!granted.includes("ads_read")) return { ok: false, motivo: "sin_ads_read" };
  if (granted.includes("ads_management")) return { ok: false, motivo: "ads_management" };
  return { ok: true };
}

export function diaCalendario(fecha: Date, zona = "America/Argentina/Buenos_Aires"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
}

export function sumarDias(iso: string, dias: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + dias)).toISOString().slice(0, 10);
}

/** Relee dos días detrás del cursor. Sin cursor, toma la semana cerrada hasta ayer. */
export function ventanaIncremental(ultimoDia: string | null, hoy: string): { since: string; until: string } {
  const until = sumarDias(hoy, -1);
  const since = ultimoDia ? sumarDias(ultimoDia, -2) : sumarDias(until, -6);
  return since > until ? { since: until, until } : { since, until };
}

/** Incluye el día en curso y relee los dos anteriores. No agenda un cron. */
export function planDeLectura(ultimoDia: string | null, hoy: string): { since: string; until: string } {
  const since = ultimoDia ? sumarDias(ultimoDia, -2) : sumarDias(hoy, -7);
  return since > hoy ? { since: hoy, until: hoy } : { since, until: hoy };
}

export function estadoToken(vence: string, hoy: string): "vigente" | "por_vencer" | "vencido" {
  if (hoy > vence) return "vencido";
  if (hoy >= sumarDias(vence, -14)) return "por_vencer";
  return "vigente";
}

export function parsearFilaMeta(row: Record<string, unknown>, campana = false): FilaMeta8q | null {
  const dia = texto(row.date_start);
  const gasto = numero(row.spend);
  if (!dia || gasto == null) return null;
  const actions = stats(row.actions);
  const values = stats(row.action_values);
  const costs = stats(row.cost_per_action_type);
  const roas = stats(row.purchase_roas);
  const purchase = elegirCompra(actions);
  const valor = purchase ? numero(values.find((item) => item.action_type === purchase.type)?.value) : actions.length ? 0 : null;
  return {
    dia,
    campanaId: campana ? texto(row.campaign_id) : null,
    campanaNombre: campana ? texto(row.campaign_name) : null,
    gasto,
    impresiones: entero(row.impressions),
    clics: entero(row.clicks),
    compras: purchase ? purchase.count : actions.length ? 0 : null,
    valorCompras: valor,
    cpa: purchase ? numero(costs.find((item) => item.action_type === purchase.type)?.value) : null,
    roas: purchase ? numero(roas.find((item) => item.action_type === purchase.type)?.value ?? roas[0]?.value) : numero(roas[0]?.value),
    moneda: texto(row.account_currency),
    atribucion: texto(row.attribution_setting),
  };
}

export function periodoMeta(filas: FilaMeta8q[]): { gasto: number; compras: number | null; valorCompras: number | null; impresiones: number | null; clics: number | null; cpa: number | null; roas: number | null } | null {
  if (!filas.length) return null;
  const gasto = redondear(filas.reduce((sum, fila) => sum + fila.gasto, 0));
  const compras = filas.every((fila) => fila.compras == null) ? null : filas.reduce((sum, fila) => sum + (fila.compras ?? 0), 0);
  const valor = filas.every((fila) => fila.valorCompras == null) ? null : redondear(filas.reduce((sum, fila) => sum + (fila.valorCompras ?? 0), 0));
  const impresiones = filas.every((fila) => fila.impresiones == null) ? null : filas.reduce((sum, fila) => sum + (fila.impresiones ?? 0), 0);
  const clics = filas.every((fila) => fila.clics == null) ? null : filas.reduce((sum, fila) => sum + (fila.clics ?? 0), 0);
  return {
    gasto,
    compras,
    valorCompras: valor,
    impresiones,
    clics,
    cpa: compras ? redondear(gasto / compras) : null,
    roas: gasto > 0 && valor != null ? redondear(valor / gasto) : null,
  };
}

export const UPSERT_DIARIO = `INSERT INTO meta_8q_insight_daily
  (ad_account_id, day, spend, impressions, clicks, purchases, purchase_value, cpa, roas, currency, timezone, attribution, partial, read_at)
  VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
  ON CONFLICT (ad_account_id, day) DO UPDATE SET
    spend = EXCLUDED.spend,
    impressions = EXCLUDED.impressions,
    clicks = EXCLUDED.clicks,
    purchases = EXCLUDED.purchases,
    purchase_value = EXCLUDED.purchase_value,
    cpa = EXCLUDED.cpa,
    roas = EXCLUDED.roas,
    currency = EXCLUDED.currency,
    timezone = EXCLUDED.timezone,
    attribution = EXCLUDED.attribution,
    partial = EXCLUDED.partial,
    read_at = now()`;

export const UPSERT_CAMPANA = `INSERT INTO meta_8q_campaign_daily
  (ad_account_id, campaign_id, day, campaign_name, spend, impressions, clicks, purchases, purchase_value, currency, timezone, attribution, read_at)
  VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
  ON CONFLICT (ad_account_id, campaign_id, day) DO UPDATE SET
    campaign_name = EXCLUDED.campaign_name,
    spend = EXCLUDED.spend,
    impressions = EXCLUDED.impressions,
    clicks = EXCLUDED.clicks,
    purchases = EXCLUDED.purchases,
    purchase_value = EXCLUDED.purchase_value,
    currency = EXCLUDED.currency,
    timezone = EXCLUDED.timezone,
    attribution = EXCLUDED.attribution,
    read_at = now()`;

export const UPSERT_AUDITORIA = `INSERT INTO meta_8q_range_audit
  (ad_account_id, level, since_day, until_day, spend, purchases, purchase_value, attribution, read_at)
  VALUES ($1, 'account', $2::date, $3::date, $4, $5, $6, $7, now())`;

export const UPSERT_CURSOR = `INSERT INTO meta_8q_sync_cursor
  (ad_account_id, last_day, token_expires_on, updated_at)
  VALUES ($1, $2::date, $3::date, now())
  ON CONFLICT (ad_account_id) DO UPDATE SET
    last_day = EXCLUDED.last_day,
    token_expires_on = EXCLUDED.token_expires_on,
    updated_at = now()`;

export async function guardarMetricasMeta8q(input: {
  confirmar: boolean;
  cuenta: string;
  filas: FilaMeta8q[];
  ejecutar: (sql: string, params: unknown[]) => Promise<void>;
  zona?: string;
  hoy?: string;
}): Promise<{ estado: "no_aplicado" | "vacio" | "guardado"; filas: number }> {
  if (input.confirmar !== true) return { estado: "no_aplicado", filas: 0 };
  const cuenta = normalizarCuenta(input.cuenta);
  if (!cuenta || !input.filas.length) return { estado: "vacio", filas: 0 };
  const zona = input.zona ?? "America/Los_Angeles";
  let escritas = 0;
  for (const fila of input.filas) {
    if (fila.campanaId) {
      await input.ejecutar(UPSERT_CAMPANA, [cuenta, fila.campanaId, fila.dia, fila.campanaNombre, fila.gasto, fila.impresiones, fila.clics, fila.compras, fila.valorCompras, fila.moneda, zona, fila.atribucion]);
    } else {
      await input.ejecutar(UPSERT_DIARIO, [cuenta, fila.dia, fila.gasto, fila.impresiones, fila.clics, fila.compras, fila.valorCompras, fila.cpa, fila.roas, fila.moneda, zona, fila.atribucion, fila.dia === input.hoy]);
    }
    escritas += 1;
  }
  return { estado: "guardado", filas: escritas };
}

export type CuentaMeta8q = {
  id: string;
  nombre: string;
  moneda: string;
  zona: string;
  estado: number | null;
};

export function tokenDeLectura(env: Meta8qEnv): { ok: false; faltan: string[] } | { ok: true; token: string } {
  const token = (env.META_8Q_ACCESS_TOKEN ?? "").trim();
  if (token.length < 20 || /\s/.test(token)) return { ok: false, faltan: ["META_8Q_ACCESS_TOKEN"] };
  return { ok: true, token };
}

/** Solo elige una cuenta si el nombre dice 8CHOQ y Argentina. Si hay más de una, no elige. */
export function elegirCuenta8q(cuentas: { id: string; nombre: string }[]): { estado: "unica"; id: string } | { estado: "ambiguo" } | { estado: "ninguna" } {
  const exactas = cuentas.filter((cuenta) => /8choq/i.test(cuenta.nombre) && /argentin/i.test(cuenta.nombre));
  if (exactas.length === 1) return { estado: "unica", id: exactas[0].id };
  if (exactas.length > 1) return { estado: "ambiguo" };
  return { estado: "ninguna" };
}

export async function listarCuentasMeta8q(env: Meta8qEnv, fetchImpl: FetchLike = fetch): Promise<
  | { estado: "sin_conectar"; faltan: string[] }
  | { estado: "rechazada"; motivo: string }
  | { estado: "cuentas"; permisos: string[]; cuentas: CuentaMeta8q[] }
> {
  const credencial = tokenDeLectura(env);
  if (!credencial.ok) return { estado: "sin_conectar", faltan: credencial.faltan };
  const permisos = await permisosOtorgados(fetchImpl, credencial.token);
  if (!permisos.ok) return { estado: "rechazada", motivo: permisos.motivo };
  const cuentas: CuentaMeta8q[] = [];
  let after: string | undefined;
  do {
    const page = await graphGet(fetchImpl, credencial.token, "/me/adaccounts", {
      fields: "id,name,currency,timezone_name,account_status",
      limit: "50",
      ...(after ? { after } : {}),
    });
    const data = Array.isArray(page.data) ? page.data : [];
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const id = texto(record.id);
      if (!id) continue;
      cuentas.push({
        id,
        nombre: texto(record.name) ?? id,
        moneda: texto(record.currency) ?? "",
        zona: texto(record.timezone_name) ?? "",
        estado: typeof record.account_status === "number" ? record.account_status : null,
      });
    }
    const paging = page.paging;
    const cursor = paging && typeof paging === "object" ? texto((paging as { cursors?: { after?: unknown } }).cursors?.after) : null;
    const hasNext = Boolean(paging && typeof paging === "object" && (paging as { next?: unknown }).next);
    if (hasNext && (!cursor || cursor === after)) return { estado: "rechazada", motivo: "incompleto" };
    after = hasNext ? cursor ?? undefined : undefined;
  } while (after);
  return { estado: "cuentas", permisos: permisos.permisos, cuentas };
}

async function permisosOtorgados(fetchImpl: FetchLike, token: string): Promise<{ ok: true; permisos: string[] } | { ok: false; motivo: string }> {
  const payload = await graphGet(fetchImpl, token, "/me/permissions", {});
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const granted = rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as { permission?: unknown; status?: unknown };
    if (typeof record.permission !== "string" || record.status !== "granted") return [];
    return [record.permission];
  });
  const decision = permisosDeLectura(granted.map((permission) => ({ permission, status: "granted" })));
  if (!decision.ok) return { ok: false, motivo: decision.motivo };
  return { ok: true, permisos: granted.sort() };
}

export async function validarMeta8q(env: Meta8qEnv, fetchImpl: FetchLike = fetch, ahora = new Date()): Promise<ValidacionMeta8q> {
  const credenciales = credencialesMeta8q(env);
  if (!credenciales.ok) return { estado: "sin_conectar", faltan: credenciales.faltan };
  const permisos = await graphGet(fetchImpl, credenciales.token, "/me/permissions", {});
  const rows = Array.isArray(permisos.data) ? permisos.data : [];
  const decision = permisosDeLectura(rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as { permission?: unknown; status?: unknown };
    if (typeof record.permission !== "string" || typeof record.status !== "string") return [];
    return [{ permission: record.permission, status: record.status }];
  }));
  if (!decision.ok) return { estado: "rechazada", motivo: decision.motivo };
  const dia = sumarDias(diaCalendario(ahora), -1);
  const data = await leerInsights(fetchImpl, credenciales.token, credenciales.accountId, {
    level: "account",
    time_range: JSON.stringify({ since: dia, until: dia }),
    fields: INSIGHT_FIELDS,
  });
  const fila = data.map((row) => parsearFilaMeta(row)).find((row) => row?.dia === dia) ?? null;
  if (!fila) return { estado: "rechazada", motivo: "incompleto" };
  return { estado: "leida", fila };
}

export async function leerRangoMeta8q(input: {
  env: Meta8qEnv;
  since: string;
  until: string;
  nivel: "account" | "campaign";
  resumen?: boolean;
  fetchImpl?: FetchLike;
}): Promise<{ ok: true; filas: FilaMeta8q[] } | { ok: false; estado: "sin_conectar" | "rechazada"; motivo: string }> {
  const credenciales = credencialesMeta8q(input.env);
  if (!credenciales.ok) return { ok: false, estado: "sin_conectar", motivo: credenciales.faltan.join(",") };
  const fetchImpl = input.fetchImpl ?? fetch;
  const permisos = await graphGet(fetchImpl, credenciales.token, "/me/permissions", {});
  const rows = Array.isArray(permisos.data) ? permisos.data : [];
  const decision = permisosDeLectura(rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as { permission?: unknown; status?: unknown };
    if (typeof record.permission !== "string" || typeof record.status !== "string") return [];
    return [{ permission: record.permission, status: record.status }];
  }));
  if (!decision.ok) return { ok: false, estado: "rechazada", motivo: decision.motivo };
  const fields = input.nivel === "campaign" ? `campaign_id,campaign_name,${INSIGHT_FIELDS}` : INSIGHT_FIELDS;
  const data = await leerInsights(fetchImpl, credenciales.token, credenciales.accountId, {
    level: input.nivel,
    ...(input.resumen ? {} : { time_increment: "1" }),
    time_range: JSON.stringify({ since: input.since, until: input.until }),
    fields,
  });
  return { ok: true, filas: data.flatMap((row) => {
    const parsed = parsearFilaMeta(row, input.nivel === "campaign");
    return parsed ? [parsed] : [];
  }) };
}

async function leerInsights(fetchImpl: FetchLike, token: string, accountId: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let after: string | undefined;
  do {
    const page = await graphGet(fetchImpl, token, `/${accountId}/insights`, { ...params, limit: "100", ...(after ? { after } : {}) });
    if (!Array.isArray(page.data)) throw new Error("incompleto");
    for (const item of page.data) {
      if (item && typeof item === "object") rows.push(item as Record<string, unknown>);
    }
    const paging = page.paging;
    const cursor = paging && typeof paging === "object" ? texto((paging as { cursors?: { after?: unknown } }).cursors?.after) : null;
    const hasNext = Boolean(paging && typeof paging === "object" && (paging as { next?: unknown }).next);
    if (hasNext && (!cursor || cursor === after)) throw new Error("incompleto");
    after = hasNext ? cursor ?? undefined : undefined;
  } while (after);
  return rows;
}

async function graphGet(fetchImpl: FetchLike, token: string, path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = new URL(`https://graph.facebook.com/${META_8Q_VERSION}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
  } catch {
    throw new Error("red");
  }
  const payload = await response.json().catch(() => ({})) as { error?: { code?: number } };
  if (!response.ok) {
    const code = payload.error?.code;
    if (code === 190) throw new Error("invalido");
    if (code === 10 || code === 200) throw new Error("permiso");
    if (code === 4 || code === 17 || code === 32 || code === 613) throw new Error("limite");
    throw new Error("meta");
  }
  return payload as Record<string, unknown>;
}

function elegirCompra(actions: { action_type: string; value: string }[]): { type: string; count: number } | null {
  for (const type of PURCHASE_TYPES) {
    const found = actions.find((action) => action.action_type === type);
    if (!found) continue;
    const parsed = Number(found.value);
    if (!Number.isFinite(parsed)) continue;
    return { type, count: Math.trunc(parsed) };
  }
  return null;
}

function stats(value: unknown): { action_type: string; value: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as { action_type?: unknown; value?: unknown };
    if (typeof record.action_type !== "string" || typeof record.value !== "string") return [];
    return [{ action_type: record.action_type, value: record.value }];
  });
}

function texto(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function numero(value: unknown): number | null {
  if (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? redondear(parsed) : null;
}

function entero(value: unknown): number | null {
  const parsed = numero(value);
  return parsed == null ? null : Math.trunc(parsed);
}

function redondear(value: number): number {
  return Math.round(value * 100) / 100;
}
