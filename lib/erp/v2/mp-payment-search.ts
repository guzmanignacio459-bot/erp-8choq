/**
 * Mercado Pago API — búsqueda y fetch (M3.1b staging, sin GAS)
 */

export type MpFetchResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; data: unknown };

export type MpSearchResult =
  | {
      ok: true;
      paymentId: number | null;
      pickedRule: string;
    }
  | { ok: false; status: number; data: unknown };

export type TnOrderInference = {
  tnOrderId: string | null;
  matchRule: string;
  matchConfidence: number;
};

function getMpAccessToken(): string {
  const token = (process.env.MP_ACCESS_TOKEN ?? "").trim();
  if (!token) {
    throw new Error("MP_ACCESS_TOKEN missing");
  }
  return token;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function fetchMpPaymentById(
  paymentId: number | string
): Promise<MpFetchResult> {
  const token = getMpAccessToken();
  const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();
  const data = safeJsonParse(text) ?? { raw: text };
  if (!res.ok) {
    return { ok: false, status: res.status, data };
  }
  return { ok: true, data: data as Record<string, unknown> };
}

/**
 * Busca pago por external_reference == tnOrderId.
 * Prefiere approved + más reciente.
 */
export async function searchMpPaymentIdByTnOrderId(
  tnOrderId: string
): Promise<MpSearchResult> {
  const token = getMpAccessToken();
  const qs = new URLSearchParams({
    external_reference: tnOrderId,
    sort: "date_created",
    criteria: "desc",
    limit: "20",
    offset: "0",
  });

  const url = `https://api.mercadopago.com/v1/payments/search?${qs.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();
  const data = safeJsonParse(text) as { results?: unknown[] } | null;

  if (!res.ok) {
    return { ok: false, status: res.status, data };
  }

  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) {
    return { ok: true, paymentId: null, pickedRule: "no_results" };
  }

  const score = (p: Record<string, unknown>) => {
    const st = String(p?.status ?? "");
    const approved = st === "approved" ? 1000 : 0;
    const da = Date.parse(String(p?.date_approved ?? "")) || 0;
    const dc = Date.parse(String(p?.date_created ?? "")) || 0;
    return approved + Math.max(da, dc);
  };

  const best = [...results]
    .map((r) => r as Record<string, unknown>)
    .sort((a, b) => score(b) - score(a))[0];
  const pid = Number(best?.id);

  if (!pid || Number.isNaN(pid)) {
    return { ok: true, paymentId: null, pickedRule: "id_not_numeric" };
  }

  return {
    ok: true,
    paymentId: pid,
    pickedRule: "picked_best_from_search",
  };
}

export function inferTnOrderIdFromMp(
  mp: Record<string, unknown>
): TnOrderInference {
  const extRef = String(mp?.external_reference ?? "").trim();
  if (/^\d+$/.test(extRef)) {
    return {
      tnOrderId: extRef,
      matchRule: "mp.external_reference_numeric",
      matchConfidence: 0.9,
    };
  }

  const items = (mp?.additional_info as { items?: unknown[] } | undefined)
    ?.items;
  if (Array.isArray(items)) {
    for (const it of items) {
      const maybe = String((it as { id?: string })?.id ?? "").trim();
      if (/^\d+$/.test(maybe)) {
        return {
          tnOrderId: maybe,
          matchRule: "mp.additional_info.items.id_numeric",
          matchConfidence: 0.7,
        };
      }
    }
  }

  const addExt = String(
    (mp?.additional_info as { external_reference?: string } | undefined)
      ?.external_reference ?? ""
  ).trim();
  if (/^\d+$/.test(addExt)) {
    return {
      tnOrderId: addExt,
      matchRule: "mp.additional_info.external_reference_numeric",
      matchConfidence: 0.6,
    };
  }

  return { tnOrderId: null, matchRule: "not_found", matchConfidence: 0 };
}
