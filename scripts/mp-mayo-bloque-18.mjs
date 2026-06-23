#!/usr/bin/env node
/**
 * MP Mayo — Bloque 18 (11 TN duplicados 09–11 mayo).
 * POST secuencial /api/erp/mp/apply — force: false.
 * Fallback idRemito si queda hermano pendiente.
 */

const PROD =
  process.env.PROD_URL ??
  "https://nextjs-boilerplate-topaz-iota-40.vercel.app";

const BLOCK_TNS = [
  "1965706208",
  "1945857648",
  "1965738678",
  "1965612099",
  "1965918902",
  "1965933254",
  "1966011575",
  "1965956866",
  "1965924940",
  "1966596806",
  "1966929851",
];

const MAYO_FROM = "2026-05-01";
const MAYO_TO = "2026-05-31";

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

async function fetchRemitos() {
  const res = await fetch(`${PROD}/api/erp/remitos`, { cache: "no-store" });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "remitos fail");
  return json.data ?? [];
}

function mayoRemitos(remitos) {
  const bounds = artRangeBoundsMs(MAYO_FROM, MAYO_TO);
  return remitos.filter((r) => {
    const ms = Date.parse(String(r.fechaRaw || r.fechaDisplay || ""));
    return !Number.isNaN(ms) && ms >= bounds.startMs && ms <= bounds.endMs;
  });
}

function countMayoMp(remitos) {
  const mayo = mayoRemitos(remitos);
  let mpApplied = 0;
  let mpPending = 0;
  let mpPendingTnUnique = new Set();
  for (const r of mayo) {
    const tn = String(r.tnOrderId ?? "").trim();
    if (hasMpApplied(r)) mpApplied++;
    else if (isMpPaymentMethod(r.metodoDePago) && tn) {
      mpPending++;
      mpPendingTnUnique.add(tn);
    }
  }
  return {
    remitosMayo: mayo.length,
    mpApplied,
    mpPending,
    mpPendingTnUnique: mpPendingTnUnique.size,
  };
}

function pendingBrothersForTn(remitos, tnOrderId) {
  return remitos.filter((r) => {
    const tn = String(r.tnOrderId ?? "").trim();
    return (
      tn === tnOrderId &&
      isMpPaymentMethod(r.metodoDePago) &&
      !hasMpApplied(r)
    );
  });
}

async function applyMp({ tnOrderId, idRemito }) {
  const started = Date.now();
  const body = { tnOrderId, force: false };
  if (idRemito) body.idRemito = idRemito;

  const res = await fetch(`${PROD}/api/erp/mp/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { ok: false, error: "invalid_json", rawBody: text.slice(0, 200) };
  }

  const gp = json?.details?.gasParsed ?? {};
  let status = "fallida";
  if (json?.ok && json?.skipped) status = "skipped";
  else if (json?.ok && !json?.skipped) status = "exitosa";
  else if (
    String(json?.error ?? json?.message ?? "")
      .toLowerCase()
      .includes("payment_not_found")
  )
    status = "payment_not_found";

  return {
    tnOrderId,
    idRemito: idRemito ?? null,
    http: res.status,
    status,
    skipped: json?.skipped === true,
    mpPaymentId: json?.mpPaymentId ?? null,
    gasIdRemito: gp.idRemito ?? null,
    siblingsUpdated: gp.siblingsUpdated,
    siblingsItemsWritten: gp.siblingsItemsWritten,
    remitoRow: gp.remitoRow ?? null,
    error: json?.error ?? json?.message ?? null,
    correlationId: json?.correlationId ?? null,
    elapsedMs: Date.now() - started,
  };
}

async function main() {
  console.log("=== MP MAYO Bloque 18 ===");
  console.log("PROD:", PROD);
  console.log("TN objetivo:", BLOCK_TNS.length);
  console.log("---");

  const remitosPre = await fetchRemitos();
  const pre = countMayoMp(remitosPre);
  console.log("\n=== PRE-BLOQUE Mayo ===");
  console.table(pre);

  const prePendingByTn = {};
  for (const tn of BLOCK_TNS) {
    prePendingByTn[tn] = pendingBrothersForTn(remitosPre, tn).map((r) => ({
      idRemito: r.idRemito,
      metodoDePago: r.metodoDePago,
    }));
  }
  console.log("\n=== PRE: hermanos MP pendientes por TN ===");
  for (const tn of BLOCK_TNS) {
    const p = prePendingByTn[tn];
    console.log(
      `  ${tn}: ${p.length} pendiente(s)`,
      p.length ? p.map((x) => x.idRemito).join(", ") : "—"
    );
  }

  const allResults = [];

  for (let i = 0; i < BLOCK_TNS.length; i++) {
    const tn = BLOCK_TNS[i];
    console.log(`\n[${i + 1}/${BLOCK_TNS.length}] TN ${tn} — apply por TN`);
    const r1 = await applyMp({ tnOrderId: tn });
    allResults.push({ phase: "tn", ...r1 });
    console.log(
      `  HTTP ${r1.http} | ${r1.status} | gasId=${r1.gasIdRemito ?? "—"} | siblings=${r1.siblingsUpdated ?? "—"}`
    );

    let remitosMid = await fetchRemitos();
    let pending = pendingBrothersForTn(remitosMid, tn);

    for (const bro of pending) {
      console.log(
        `  fallback idRemito ${bro.idRemito} (hermano pendiente)`
      );
      const r2 = await applyMp({ tnOrderId: tn, idRemito: bro.idRemito });
      allResults.push({ phase: "idRemito", ...r2 });
      console.log(
        `  HTTP ${r2.http} | ${r2.status} | gasId=${r2.gasIdRemito ?? "—"} | siblings=${r2.siblingsUpdated ?? "—"}`
      );
      remitosMid = await fetchRemitos();
      pending = pendingBrothersForTn(remitosMid, tn);
    }

    const still = pendingBrothersForTn(remitosMid, tn);
    if (still.length) {
      console.warn(
        `  AVISO: TN ${tn} sigue con ${still.length} hermano(s) sin MP:`,
        still.map((r) => r.idRemito).join(", ")
      );
    } else {
      console.log(`  OK: TN ${tn} sin hermanos MP pendientes`);
    }
  }

  console.log("\n=== RESULTADOS (todos los POST) ===");
  console.table(
    allResults.map((r) => ({
      phase: r.phase,
      TN: r.tnOrderId,
      idRemito: r.idRemito ?? "—",
      HTTP: r.http,
      status: r.status,
      gasIdRemito: r.gasIdRemito ?? "—",
      siblingsUpdated: r.siblingsUpdated ?? "—",
      mpPaymentId: r.mpPaymentId ?? "—",
      ms: r.elapsedMs,
      error: r.error ?? "—",
    }))
  );

  const remitosPost = await fetchRemitos();
  const post = countMayoMp(remitosPost);
  console.log("\n=== POST-BLOQUE Mayo ===");
  console.table({
    ...post,
    mpAppliedDelta: post.mpApplied - pre.mpApplied,
    mpPendingDelta: post.mpPending - pre.mpPending,
  });

  console.log("\n=== POST: hermanos MP pendientes (solo 11 TN) ===");
  let blockStillPending = 0;
  for (const tn of BLOCK_TNS) {
    const p = pendingBrothersForTn(remitosPost, tn);
    if (p.length) blockStillPending += p.length;
    console.log(
      `  ${tn}: ${p.length}`,
      p.length ? `→ ${p.map((r) => r.idRemito).join(", ")}` : "✓"
    );
  }

  const summary = {
    tnProcesados: BLOCK_TNS.length,
    postsTotal: allResults.length,
    postsExitosas: allResults.filter((r) => r.status === "exitosa").length,
    postsSkipped: allResults.filter((r) => r.status === "skipped").length,
    postsFallidas: allResults.filter(
      (r) => r.status === "fallida" || r.status === "payment_not_found"
    ).length,
    fallbacksIdRemito: allResults.filter((r) => r.phase === "idRemito").length,
  };
  console.log("\n=== RESUMEN BLOQUE 18 ===");
  console.table(summary);

  const metaOk =
    post.mpApplied === 378 &&
    post.mpPending === 0 &&
    blockStillPending === 0;

  console.log("\n=== META ===");
  console.log(`  MP aplicados: ${post.mpApplied} / 378 ${post.mpApplied === 378 ? "✓" : "✗"}`);
  console.log(`  MP pendientes: ${post.mpPending} / 0 ${post.mpPending === 0 ? "✓" : "✗"}`);
  console.log(
    `  Hermanos pendientes (11 TN): ${blockStillPending} ${blockStillPending === 0 ? "✓" : "✗"}`
  );
  console.log(`  META_GLOBAL: ${metaOk ? "OK" : "PENDIENTE"}`);

  if (summary.postsFallidas > 0 || !metaOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
