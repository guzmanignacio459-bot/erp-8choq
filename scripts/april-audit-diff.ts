import fs from "fs";
import {
  artCalendarDayKey,
  artDayBoundsMs,
  parseArtInstantMs,
} from "@/lib/erp/art-date";

type TnOrder = Record<string, unknown>;

const envText = fs.readFileSync(".env.local", "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const STORE = process.env.TIENDANUBE_STORE_ID!;
const TOKEN = process.env.TIENDANUBE_ACCESS_TOKEN!;
const UA = process.env.TIENDANUBE_USER_AGENT || "8Q ERP";
const BASE = "https://api.tiendanube.com/v1";
const PROD = "https://nextjs-boilerplate-topaz-iota-40.vercel.app";

const APR_START_MS = artDayBoundsMs(2026, 4, 1).startMs;
const APR_END_MS = artDayBoundsMs(2026, 4, 30).endMs;

function isPaid(o: TnOrder): boolean {
  const ps = String(o.payment_status ?? "").toLowerCase();
  const st = String(o.status ?? "").toLowerCase();
  if (ps === "paid" || ps === "pagado") return true;
  if (st === "paid" || st === "pagado") return true;
  if (o.paid_at) return true;
  return false;
}

function pickOrderDateISO(o: TnOrder): string {
  if (o.paid_at) return String(o.paid_at);
  const completed = o.completed_at as { date?: string } | undefined;
  if (completed?.date) return String(completed.date);
  if (o.created_at) return String(o.created_at);
  return "";
}

function pickOrderDateMs(o: TnOrder): number | null {
  const iso = pickOrderDateISO(o);
  return iso ? parseArtInstantMs(iso) : null;
}

function inUtcRange(iso: string, fromISO: string, toISO: string): boolean {
  const t = new Date(iso).getTime();
  const a = new Date(fromISO).getTime();
  const b = new Date(toISO).getTime();
  return Number.isFinite(t) && t >= a && t <= b;
}

function inArtApril(ms: number | null): boolean {
  if (ms == null) return false;
  return ms >= APR_START_MS && ms <= APR_END_MS;
}

function fmtArt(ms: number | null): string {
  if (ms == null) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function fmtField(raw: unknown): string {
  if (!raw) return "—";
  const ms = parseArtInstantMs(String(raw));
  return ms == null ? String(raw) : fmtArt(ms);
}

function totalOf(o: TnOrder): number {
  const v = o.total ?? o.total_price ?? o.total_paid ?? 0;
  return Number(String(v).replace(",", ".")) || 0;
}

async function tnFetch(path: string) {
  const res = await fetch(`${BASE}/${STORE}${path}`, {
    headers: {
      Authentication: `bearer ${TOKEN}`,
      "User-Agent": UA,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, text, json };
}

async function fetchOrders(params: Record<string, string>, maxPages = 200) {
  const orders: TnOrder[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const q = new URLSearchParams({
      ...params,
      page: String(page),
      per_page: "200",
    });
    const r = await tnFetch(`/orders?${q}`);
    if (!r.ok && r.status === 404 && /Last page is/.test(r.text)) break;
    if (!r.ok) {
      throw new Error(
        `TN ${params.payment_status || "any"} page ${page} status ${r.status}`
      );
    }
    const batch = Array.isArray(r.json) ? (r.json as TnOrder[]) : [];
    if (!batch.length) break;
    orders.push(...batch);
    if (batch.length < 200) break;
    await new Promise((x) => setTimeout(x, 250));
  }
  return orders;
}

function orderRow(o: TnOrder, motivo: string) {
  const pickMs = pickOrderDateMs(o);
  return {
    orderId: String(o.id ?? ""),
    createdAt: fmtField(o.created_at),
    paidAt: fmtField(o.paid_at),
    pickDateArt: pickMs ? fmtArt(pickMs) : "—",
    paymentStatus: String(o.payment_status ?? "—"),
    status: String(o.status ?? "—"),
    total: totalOf(o),
    motivo,
  };
}

async function main() {
  console.error("Fetching TN paid created Oct-Apr...");
  const apiPool = await fetchOrders({
    payment_status: "paid",
    created_at_min: "2025-10-01T00:00:00.000Z",
    created_at_max: "2026-04-30T23:59:59.999Z",
  });

  console.error("Fetching TN any-status created April...");
  const aprilAnyStatus = await fetchOrders({
    payment_status: "any",
    created_at_min: "2026-04-01T00:00:00.000Z",
    created_at_max: "2026-04-30T23:59:59.999Z",
  });

  const byId = new Map<string, TnOrder>();
  for (const o of [...apiPool, ...aprilAnyStatus]) {
    byId.set(String(o.id), o);
  }

  const panelProxyPaidAtArt = new Set<string>();
  const apiImportListApril = new Set<string>();
  const apiImportEligible = new Set<string>();

  const fromISO = "2026-04-01T00:00:00.000Z";
  const toISO = "2026-04-30T23:59:59.999Z";
  const createdAprStart = parseArtInstantMs("2026-04-01")!;
  const createdAprEnd = parseArtInstantMs("2026-04-30T23:59:59.999")!;

  for (const o of byId.values()) {
    const id = String(o.id);
    if (!isPaid(o)) continue;

    const paidMs = o.paid_at ? parseArtInstantMs(String(o.paid_at)) : null;
    const createdMs = o.created_at
      ? parseArtInstantMs(String(o.created_at))
      : null;

    if (paidMs != null && inArtApril(paidMs)) panelProxyPaidAtArt.add(id);

    const inCreatedAprilUtc =
      createdMs != null &&
      createdMs >= createdAprStart &&
      createdMs <= createdAprEnd;

    if (
      inCreatedAprilUtc &&
      (String(o.payment_status).toLowerCase() === "paid" || o.paid_at)
    ) {
      apiImportListApril.add(id);
    }

    const pickIso = pickOrderDateISO(o);
    if (
      apiImportListApril.has(id) &&
      pickIso &&
      inUtcRange(pickIso, fromISO, toISO)
    ) {
      apiImportEligible.add(id);
    }
  }

  const panelCandidatesExtra: TnOrder[] = [];
  for (const o of aprilAnyStatus) {
    const ps = String(o.payment_status ?? "").toLowerCase();
    const paidMs = o.paid_at ? parseArtInstantMs(String(o.paid_at)) : null;
    if (inArtApril(paidMs) && !panelProxyPaidAtArt.has(String(o.id))) {
      if (
        ps === "partially_paid" ||
        ps === "authorized" ||
        ps === "pending"
      ) {
        panelCandidatesExtra.push(o);
      }
    }
  }

  console.error("Fetching ERP remitos...");
  const remRes = await fetch(`${PROD}/api/erp/remitos`, { cache: "no-store" });
  const remitos = ((await remRes.json()) as { data?: unknown[] }).data ?? [];
  const erpAprilIds = new Set<string>();
  for (const r of remitos as Array<{ fechaRaw?: string; tnOrderId?: string }>) {
    const ms = parseArtInstantMs(r.fechaRaw || "");
    if (ms == null || !inArtApril(ms)) continue;
    const tid = String(r.tnOrderId || "").trim();
    if (tid) erpAprilIds.add(tid);
  }

  const KNOWN_ERRORS: Record<string, string> = {
    "1957361015":
      "build_items: SKU sin talle válido (HJ123-XL -SCNL)",
  };

  function reasonApiNotInErp(id: string, o: TnOrder): string {
    if (KNOWN_ERRORS[id]) return KNOWN_ERRORS[id];
    const pickIso = pickOrderDateISO(o);
    if (!apiImportEligible.has(id)) {
      if (pickIso && !inUtcRange(pickIso, fromISO, toISO)) {
        return `pickOrderDateISO (${pickIso}) fuera ventana UTC Abril — en listado created_at Abril pero fecha efectiva fuera`;
      }
      return "No pasó filtro elegible import";
    }
    return "Elegible en API pero sin remito en ERP (no importada, timeout o error)";
  }

  const list1 = [...panelProxyPaidAtArt]
    .filter((id) => !apiImportListApril.has(id))
    .map((id) => {
      const o = byId.get(id)!;
      const createdMs = o.created_at
        ? parseArtInstantMs(String(o.created_at))
        : null;
      const artCreated = createdMs ? artCalendarDayKey(createdMs) : "—";
      return orderRow(
        o,
        `paid_at en Abril ART pero created_at=${artCreated} — no entra en API list (created_at_min/max Abril UTC)`
      );
    })
    .sort((a, b) => a.orderId.localeCompare(b.orderId));

  const list2 = [...apiImportEligible]
    .filter((id) => !erpAprilIds.has(id))
    .map((id) => orderRow(byId.get(id)!, reasonApiNotInErp(id, byId.get(id)!)))
    .sort((a, b) => a.orderId.localeCompare(b.orderId));

  const list2b = [...apiImportListApril]
    .filter((id) => !erpAprilIds.has(id))
    .map((id) => {
      const o = byId.get(id)!;
      let motivo = reasonApiNotInErp(id, o);
      if (erpAprilIds.has(id)) motivo = "ya en ERP";
      return orderRow(o, motivo);
    })
    .sort((a, b) => a.orderId.localeCompare(b.orderId));

  const out = {
    counts: {
      panelReported: 360,
      panelProxyPaidAtArtApril: panelProxyPaidAtArt.size,
      apiImportListCreatedAprilPaid: apiImportListApril.size,
      apiImportEligible: apiImportEligible.size,
      erpApril: erpAprilIds.size,
      list1_panelPaidNotInApiList: list1.length,
      list2_apiListNotInErp: list2b.length,
      list2_apiEligibleNotInErp: list2.length,
      extraStatusCandidates: panelCandidatesExtra.length,
    },
    list1,
    list2_apiListNotInErp: list2b,
    list2_apiEligibleNotInErp: list2,
    panelCandidatesExtra: panelCandidatesExtra.map((o) =>
      orderRow(
        o,
        `payment_status=${String(o.payment_status)} con paid_at en Abril ART — panel podría contar, API import no`
      )
    ),
  };

  fs.writeFileSync("/tmp/april_audit_diff.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out.counts, null, 2));
  console.log("Wrote /tmp/april_audit_diff.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
