/**
 * Cliente GAS read-only para Sprint L0.
 * No escribe en Sheets — solo listRemitosFull + getRemitoItemsFull.
 */

import { loadEnvLocal, requireEnv } from "./l0-env.mjs";

loadEnvLocal();

const GAS_URL = () => requireEnv("APPS_SCRIPT_URL");
const GAS_TOKEN = () => (process.env.APPS_SCRIPT_TOKEN ?? "").trim();
const TIMEOUT_MS = Number(process.env.L0_GAS_TIMEOUT_MS ?? 120_000);

async function postGas(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(GAS_URL(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: GAS_TOKEN(), ...body }),
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`GAS invalid JSON (${res.status}): ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      throw new Error(`GAS HTTP ${res.status}: ${json.error ?? text.slice(0, 120)}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchListRemitosFull() {
  const attempts = [
    { action: "listRemitosFull" },
    { method: "listRemitosFull", q: "" },
  ];
  let lastErr;
  for (const body of attempts) {
    try {
      const payload = await postGas(body);
      const rows = Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.remitos)
          ? payload.remitos
          : [];
      if (payload.ok === false && rows.length === 0) {
        throw new Error(payload.error ?? "listRemitosFull failed");
      }
      return { rows, action: body.action ?? body.method };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("listRemitosFull failed");
}

export async function fetchRemitoItemsFull(filters = {}) {
  const body = {
    action: "getRemitoItemsFull",
    from: filters.from,
    to: filters.to,
    sku: filters.sku,
    owner: filters.owner,
  };
  const payload = await postGas(body);
  if (payload.ok === false) {
    throw new Error(payload.error ?? "getRemitoItemsFull failed");
  }
  const items = payload.data?.items ?? payload.items ?? [];
  return { items, summary: payload.data?.summary ?? payload.summary ?? {} };
}
