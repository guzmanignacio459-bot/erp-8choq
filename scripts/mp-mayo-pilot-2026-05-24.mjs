#!/usr/bin/env node
/**
 * MP MAYO Fase 2.2 — Piloto 2026-05-24 (8 órdenes).
 * POST secuencial a /api/erp/mp/apply — force: false.
 *
 * Uso: node scripts/mp-mayo-pilot-2026-05-24.mjs
 *      DRY_RUN=1 node scripts/mp-mayo-pilot-2026-05-24.mjs  (solo export + pre-check)
 */

const PROD =
  process.env.PROD_URL ??
  "https://nextjs-boilerplate-topaz-iota-40.vercel.app";

const PILOT_DAY = "2026-05-24";
const DRY_RUN = process.env.DRY_RUN === "1";

function artRangeBoundsMs(fromYmd, toYmd) {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  return {
    startMs: Date.UTC(fy, fm - 1, fd, 3, 0, 0, 0),
    endMs: Date.UTC(ty, tm - 1, td + 1, 2, 59, 59, 999),
  };
}

function artDayKey(iso) {
  const ms = Date.parse(String(iso ?? ""));
  if (Number.isNaN(ms)) return null;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(ms));
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : null;
}

function hasMpApplied(r) {
  return Boolean(
    String(r.mpPaymentId ?? "").trim() ||
      String(r.mpStatus ?? "").trim() ||
      String(r.mpNetoRealOrden ?? "").trim() ||
      String(r.mpTotalCostReal ?? "").trim()
  );
}

function isMpPaymentMethod(metodo) {
  const m = String(metodo ?? "").toLowerCase();
  return m.includes("mercado") || m.includes("mp") || m.includes("cuotas");
}

function classifyResult(httpStatus, json) {
  const err = String(json?.error ?? json?.details?.error ?? "").toLowerCase();
  if (json?.ok && json?.skipped) {
    return "skipped";
  }
  if (json?.ok && !json?.skipped) {
    return "exitosa";
  }
  if (err.includes("payment_not_found")) {
    return "payment_not_found";
  }
  return "fallida";
}

async function fetchRemitos() {
  const res = await fetch(`${PROD}/api/erp/remitos`, { cache: "no-store" });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "remitos fail");
  return json.data ?? [];
}

function exportPilotList(remitos) {
  const dayBounds = artRangeBoundsMs(PILOT_DAY, PILOT_DAY);
  const dayRemitos = remitos.filter((r) => {
    const ms = Date.parse(String(r.fechaRaw || r.fechaDisplay || ""));
    return (
      !Number.isNaN(ms) &&
      ms >= dayBounds.startMs &&
      ms <= dayBounds.endMs
    );
  });

  const eligible = dayRemitos.filter(
    (r) =>
      isMpPaymentMethod(r.metodoDePago) &&
      String(r.tnOrderId ?? "").trim() &&
      !hasMpApplied(r)
  );

  return { dayRemitos, eligible };
}

async function applyOne(tnOrderId) {
  const started = Date.now();
  const res = await fetch(`${PROD}/api/erp/mp/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tnOrderId, force: false }),
    cache: "no-store",
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { ok: false, error: "invalid_json", rawBody: text.slice(0, 200) };
  }
  const status = classifyResult(res.status, json);
  const mpFound =
    status === "exitosa" ||
    (json?.ok && Boolean(json?.mpPaymentId)) ||
    Boolean(json?.details?.paymentId);
  const mpApplied = status === "exitosa";

  return {
    tnOrderId,
    http: res.status,
    mpFound,
    mpApplied,
    skipped: json?.skipped === true,
    reason: json?.reason ?? null,
    mpPaymentId: json?.mpPaymentId ?? null,
    correlationId: json?.correlationId ?? null,
    error: json?.error ?? json?.message ?? null,
    status,
    elapsedMs: Date.now() - started,
    raw: json,
  };
}

async function countMayoMp(remitos) {
  const bounds = artRangeBoundsMs("2026-05-01", "2026-05-31");
  const mayo = remitos.filter((r) => {
    const ms = Date.parse(String(r.fechaRaw || r.fechaDisplay || ""));
    return !Number.isNaN(ms) && ms >= bounds.startMs && ms <= bounds.endMs;
  });
  let applied = 0;
  let pending = 0;
  for (const r of mayo) {
    if (hasMpApplied(r)) applied++;
    else if (isMpPaymentMethod(r.metodoDePago) && String(r.tnOrderId ?? "").trim())
      pending++;
  }
  return { remitosMayo: mayo.length, mpApplied: applied, mpPending: pending };
}

async function main() {
  console.log("MP MAYO Piloto", PILOT_DAY);
  console.log("PROD:", PROD);
  console.log("DRY_RUN:", DRY_RUN);
  console.log("---");

  const remitos = await fetchRemitos();
  const { dayRemitos, eligible } = exportPilotList(remitos);

  console.log("\n=== 1. Lista piloto (elegibles MP, sin MP previo) ===");
  const list = eligible.map((r) => ({
    idRemito: r.idRemito,
    TN_ORDER_ID: String(r.tnOrderId).trim(),
    metodoDePago: r.metodoDePago,
    totalFinal: r.totalFinal,
    mpPrevio: hasMpApplied(r),
  }));
  console.table(list);
  console.log("Remitos día ART:", dayRemitos.length);
  console.log("Elegibles MP pendientes:", eligible.length);

  const alreadyApplied = dayRemitos.filter((r) => hasMpApplied(r));
  if (alreadyApplied.length) {
    console.warn("AVISO: remitos del día con MP ya aplicado:", alreadyApplied.length);
    console.table(
      alreadyApplied.map((r) => ({
        idRemito: r.idRemito,
        TN_ORDER_ID: r.tnOrderId,
        mpPaymentId: r.mpPaymentId,
      }))
    );
  }

  if (eligible.length !== 8) {
    console.error(
      `ABORT: se esperaban 8 elegibles, hay ${eligible.length}. No se ejecuta apply.`
    );
    process.exit(1);
  }

  const pre = await countMayoMp(remitos);
  console.log("\n=== Pre-check Mayo ===");
  console.table(pre);

  if (DRY_RUN) {
    console.log("\nDRY_RUN=1 — fin sin POST.");
    return;
  }

  console.log("\n=== 2. POST /api/erp/mp/apply (secuencial) ===");
  const results = [];
  for (let i = 0; i < eligible.length; i++) {
    const tn = String(eligible[i].tnOrderId).trim();
    console.log(`[${i + 1}/8] TN ${tn} ...`);
    const row = await applyOne(tn);
    results.push(row);
    console.log(
      `  HTTP ${row.http} | ${row.status} | mpApplied=${row.mpApplied} | ${row.error ?? row.reason ?? "ok"}`
    );
  }

  console.log("\n=== 3. Resultado por orden ===");
  console.table(
    results.map((r) => ({
      TN_ORDER_ID: r.tnOrderId,
      HTTP: r.http,
      mpFound: r.mpFound,
      mpApplied: r.mpApplied,
      status: r.status,
      mpPaymentId: r.mpPaymentId ?? "—",
      error: r.error ?? r.reason ?? "—",
      ms: r.elapsedMs,
    }))
  );

  const summary = {
    procesadas: results.length,
    exitosas: results.filter((r) => r.status === "exitosa").length,
    fallidas: results.filter((r) => r.status === "fallida").length,
    payment_not_found: results.filter((r) => r.status === "payment_not_found")
      .length,
    skipped: results.filter((r) => r.status === "skipped").length,
  };
  console.log("\n=== 4. Resumen piloto ===");
  console.table(summary);

  console.log("\n=== 5. Post-check (refetch remitos) ===");
  const remitosAfter = await fetchRemitos();
  const post = await countMayoMp(remitosAfter);
  const { eligible: eligibleAfter } = exportPilotList(remitosAfter);
  console.table({
    ...post,
    mpAppliedDelta: post.mpApplied - pre.mpApplied,
    mpPendingDelta: post.mpPending - pre.mpPending,
    pilotDayMpApplied: remitosAfter.filter((r) => {
      const day = artDayKey(r.fechaRaw || r.fechaDisplay);
      return day === PILOT_DAY && hasMpApplied(r);
    }).length,
    pilotDayPending: eligibleAfter.length,
  });

  const expectApplied = pre.mpApplied + summary.exitosas;
  const okApplied = post.mpApplied === expectApplied;
  const okPending = post.mpPending === pre.mpPending - summary.exitosas;

  console.log("\nValidación:");
  console.log(
    `  Mayo mpApplied: ${post.mpApplied} (esperado ${expectApplied}) ${okApplied ? "OK" : "FAIL"}`
  );
  console.log(
    `  Mayo mpPending: ${post.mpPending} (esperado ${pre.mpPending - summary.exitosas}) ${okPending ? "OK" : "FAIL"}`
  );
  console.log(
    `  Día ${PILOT_DAY} con MP: ${remitosAfter.filter((r) => artDayKey(r.fechaRaw || r.fechaDisplay) === PILOT_DAY && hasMpApplied(r)).length} (esperado 8) `
  );

  if (summary.fallidas + summary.payment_not_found > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
