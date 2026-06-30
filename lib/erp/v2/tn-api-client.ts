/**
 * Cliente Tiendanube read-only — M5.1 incremental live import
 */

export type TnApiConfig = {
  storeId: string;
  token: string;
  userAgent: string;
  apiBase: string;
};

export type TnFetchResult = {
  ok: boolean;
  status: number;
  text: string;
  json: unknown;
  url: string;
};

export type TnOrderRaw = Record<string, unknown>;

function tnConfig(): TnApiConfig {
  const storeId = (process.env.TIENDANUBE_STORE_ID ?? "").trim();
  const token = (process.env.TIENDANUBE_ACCESS_TOKEN ?? "").trim();
  const userAgent = (process.env.TIENDANUBE_USER_AGENT ?? "8Q ERP M5").trim();
  const apiBase = (
    process.env.TIENDANUBE_API_URL ?? "https://api.tiendanube.com/v1"
  ).trim();

  if (!storeId || !token) {
    throw new Error("Missing TIENDANUBE_STORE_ID or TIENDANUBE_ACCESS_TOKEN");
  }

  return { storeId, token, userAgent, apiBase };
}

export function tnEnvSummary(): Record<string, unknown> {
  const { storeId, token, userAgent, apiBase } = tnConfig();
  return {
    storeId,
    tokenPresent: Boolean(token),
    tokenLen: token.length,
    tokenPrefix: token.slice(0, 6),
    userAgent,
    apiBase,
  };
}

export function buildTnRequestUrl(apiPath: string): string {
  const { storeId, apiBase } = tnConfig();
  return `${apiBase}/${storeId}${apiPath}`;
}

function formatFetchError(err: unknown, url: string): string {
  const e = err as { message?: string; cause?: Record<string, unknown> };
  const c = (e?.cause ?? e) as Record<string, unknown>;
  const parts = [`TN fetch network error url=${url}`];
  if (c?.code) parts.push(`code=${String(c.code)}`);
  if (c?.errno) parts.push(`errno=${String(c.errno)}`);
  if (c?.syscall) parts.push(`syscall=${String(c.syscall)}`);
  if (c?.hostname) parts.push(`hostname=${String(c.hostname)}`);
  if (c?.message && c.message !== e.message) parts.push(`cause=${c.message}`);
  return parts.join(" ");
}

export async function tnFetch(
  apiPath: string,
  opts?: { logContext?: string; timeoutMs?: number }
): Promise<TnFetchResult> {
  const { token, userAgent } = tnConfig();
  const url = buildTnRequestUrl(apiPath);
  if (opts?.logContext) {
    console.log(`[TN] ${opts.logContext} GET ${url}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts?.timeoutMs ?? 30_000
  );

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authentication: `bearer ${token}`,
        "User-Agent": userAgent,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    throw new Error(formatFetchError(err, url), { cause: err });
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }

  return { ok: res.ok, status: res.status, text, json, url };
}

export async function fetchTnOrderById(
  orderId: string | number
): Promise<TnOrderRaw | null> {
  const r = await tnFetch(`/orders/${encodeURIComponent(String(orderId))}`, {
    logContext: `order=${orderId}`,
  });
  if (!r.ok) return null;
  return r.json && typeof r.json === "object"
    ? (r.json as TnOrderRaw)
    : null;
}

export type FetchTnOrdersUpdatedSinceOpts = {
  updatedAtMin: Date;
  maxPages?: number;
  throttleMs?: number;
  windowLabel?: string;
};

/**
 * Lista órdenes TN modificadas desde watermark (sin filtro payment_status
 * para capturar cancelaciones y refunds).
 *
 * M6.6.2.1 — El list incremental (`updated_at_min`) puede devolver
 * `payment_status=paid` con `paid_at=null` aunque `/orders/{id}` sí tenga
 * `paid_at`. El live import preserva `tn_paid_at` existente en updates;
 * ver mergeTnPaidAt en map-tn-order-record.ts.
 */
export async function fetchTnOrdersUpdatedSince(
  opts: FetchTnOrdersUpdatedSinceOpts
): Promise<TnOrderRaw[]> {
  const orders: TnOrderRaw[] = [];
  const maxPages = opts.maxPages ?? 50;
  const throttleMs = opts.throttleMs ?? 150;
  const updatedMin = opts.updatedAtMin.toISOString();
  const label = opts.windowLabel ?? updatedMin;

  for (let page = 1; page <= maxPages; page++) {
    const q = new URLSearchParams({
      updated_at_min: updatedMin,
      page: String(page),
      per_page: "200",
    });

    const r = await tnFetch(`/orders?${q}`, {
      logContext: `updated_since=${label} page=${page}`,
    });

    if (!r.ok && /Last page is/i.test(r.text)) break;
    if (!r.ok) {
      throw new Error(
        `TN HTTP ${r.status} updated_since=${label} page=${page} url=${r.url} body=${r.text.slice(0, 200)}`
      );
    }

    const batch = Array.isArray(r.json) ? (r.json as TnOrderRaw[]) : [];
    if (!batch.length) break;
    orders.push(...batch);
    if (batch.length < 200) break;
    await new Promise((x) => setTimeout(x, throttleMs));
  }

  return orders;
}
