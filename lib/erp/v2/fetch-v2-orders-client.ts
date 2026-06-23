import type { V2CommercialOrder, V2OrdersListResponse } from "@/types/erp-v2-api";

export type FetchV2OrdersClientParams = {
  from?: string;
  to?: string;
  kpi?: boolean;
  q?: string;
  commercialStatus?: string;
  signal?: AbortSignal;
};

export async function fetchAllV2CommercialOrders(
  params: FetchV2OrdersClientParams
): Promise<V2OrdersListResponse> {
  const perPage = 200;
  let page = 1;
  let total = 0;
  const all: V2CommercialOrder[] = [];
  let lastMeta: V2OrdersListResponse | null = null;

  while (page === 1 || all.length < total) {
    const sp = new URLSearchParams();
    if (params.from) sp.set("from", params.from);
    if (params.to) sp.set("to", params.to);
    if (params.kpi) sp.set("kpi", "1");
    if (params.q?.trim()) sp.set("q", params.q.trim());
    if (params.commercialStatus && params.commercialStatus !== "all") {
      sp.set("commercialStatus", params.commercialStatus);
    }
    sp.set("page", String(page));
    sp.set("perPage", String(perPage));

    const res = await fetch(`/api/v2/orders?${sp}`, {
      cache: "no-store",
      signal: params.signal,
    });
    const json = (await res.json()) as V2OrdersListResponse;

    if (!json.ok) {
      return json;
    }

    lastMeta = json;
    all.push(...(json.data ?? []));
    total = json.total ?? all.length;

    if ((json.data?.length ?? 0) < perPage) break;
    page += 1;
    if (page > 50) break;
  }

  return {
    ok: true,
    data: all,
    count: all.length,
    page: 1,
    perPage: all.length,
    total: all.length,
    fetchedAt: lastMeta?.fetchedAt ?? new Date().toISOString(),
    source: "neon-staging",
    urlMeta: lastMeta?.urlMeta,
    kpi: lastMeta?.kpi,
  };
}
