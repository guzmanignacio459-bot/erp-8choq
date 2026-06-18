#!/usr/bin/env node
/**
 * FASE J.4 — MP Junio 01–06
 * POST /api/erp/mp/apply — force: false, secuencial
 *
 * Uso:
 *   node scripts/fase-j4-mp-junio.mjs audit
 *   node scripts/fase-j4-mp-junio.mjs pilot
 *   node scripts/fase-j4-mp-junio.mjs bulk
 *   node scripts/fase-j4-mp-junio.mjs all
 */

import fs from "fs";
import path from "path";

const PROD =
  process.env.PROD_URL ??
  "https://nextjs-boilerplate-topaz-iota-40.vercel.app";
const JUN_FROM = "2026-06-01";
const JUN_TO = "2026-06-06";
const BLOCK_SIZE = Number(process.env.BLOCK_SIZE || 25);
const PILOT_SIZE = 5;
const PHASE = (process.argv[2] || "audit").toLowerCase();
const WIP = path.join(process.cwd(), "_wip");

function artRangeBoundsMs(fromYmd, toYmd) {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  return {
    startMs: Date.UTC(fy, fm - 1, fd, 3, 0, 0, 0),
    endMs: Date.UTC(ty, tm - 1, td + 1, 2, 59, 59, 999),
  };
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
  const err = String(json?.error ?? json?.message ?? json?.details?.error ?? "").toLowerCase();
  if (json?.ok && json?.skipped) return "skipped";
  if (json?.ok && !json?.skipped) return "applied";
  if (err.includes("payment_not_found")) return "payment_not_found";
  return "error";
}

async function fetchRemitos(retries = 4) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${PROD}/api/erp/remitos`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "remitos fail");
      return json.data ?? [];
    } catch (e) {
      lastErr = e;
      const wait = 2000 * (i + 1);
      console.warn(`fetchRemitos retry ${i + 1}/${retries} en ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

function junRemitos(remitos) {
  const bounds = artRangeBoundsMs(JUN_FROM, JUN_TO);
  return remitos.filter((r) => {
    const ms = Date.parse(String(r.fechaRaw || r.fechaDisplay || ""));
    return !Number.isNaN(ms) && ms >= bounds.startMs && ms <= bounds.endMs;
  });
}

function mpEligiblePending(remitos) {
  return junRemitos(remitos).filter(
    (r) =>
      isMpPaymentMethod(r.metodoDePago) &&
      String(r.tnOrderId ?? "").trim() &&
      !hasMpApplied(r)
  );
}

function summarizeJunMp(remitos) {
  const jun = junRemitos(remitos);
  const mpMethod = jun.filter((r) => isMpPaymentMethod(r.metodoDePago));
  const applied = mpMethod.filter(hasMpApplied);
  const pending = mpMethod.filter((r) => !hasMpApplied(r));
  return {
    junRemitos: jun.length,
    mpMethod: mpMethod.length,
    mpApplied: applied.length,
    mpPending: pending.length,
    nonMp: jun.length - mpMethod.length,
  };
}

function toAuditRow(r) {
  return {
    TN_ORDER_ID: String(r.tnOrderId ?? "").trim(),
    idRemito: r.idRemito,
    totalFinal: r.totalFinal,
    metodoDePago: r.metodoDePago,
    mpPaymentId: r.mpPaymentId ?? "",
    mpStatus: r.mpStatus ?? "",
    mpNetoRealOrden: r.mpNetoRealOrden ?? "",
    mpFeeTotalReal: r.mpFeeTotalReal ?? "",
    estado: hasMpApplied(r) ? "applied" : "pending",
  };
}

async function applyOne(tnOrderId, idRemito) {
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
  const gp = json?.details?.gasParsed ?? json?.details ?? {};
  return {
    tnOrderId,
    idRemito: idRemito ?? null,
    http: res.status,
    status: classifyResult(res.status, json),
    skipped: json?.skipped === true,
    reason: json?.reason ?? null,
    mpPaymentId: json?.mpPaymentId ?? gp?.mpPaymentId ?? null,
    mpStatus: gp?.mpStatus ?? null,
    mpNetoRealOrden: gp?.mpNetoRealOrden ?? null,
    mpFeeTotalReal: gp?.mpFeeTotalReal ?? null,
    gasIdRemito: gp?.idRemito ?? null,
    error: json?.error ?? json?.message ?? null,
    correlationId: json?.correlationId ?? null,
    elapsedMs: Date.now() - started,
  };
}

function pendingBrothers(remitos, tn) {
  return remitos.filter(
    (r) =>
      String(r.tnOrderId ?? "").trim() === tn &&
      isMpPaymentMethod(r.metodoDePago) &&
      !hasMpApplied(r)
  );
}

async function applyTnWithFallback(tnOrderId, remitos, refetchEach = false) {
  const results = [];
  const r1 = await applyOne(tnOrderId);
  results.push(r1);

  if (!refetchEach) return results;

  let mid = await fetchRemitos();
  let pending = pendingBrothers(mid, tnOrderId);
  for (const bro of pending) {
    const r2 = await applyOne(tnOrderId, bro.idRemito);
    results.push(r2);
    mid = await fetchRemitos();
    pending = pendingBrothers(mid, tnOrderId);
  }
  return results;
}

function pickPilotTns(pending) {
  const seen = new Set();
  const diverse = [];
  const methods = new Set();
  for (const r of pending) {
    const tn = String(r.tnOrderId).trim();
    const m = String(r.metodoDePago ?? "");
    if (seen.has(tn)) continue;
    if (!methods.has(m) || diverse.length < PILOT_SIZE) {
      diverse.push(tn);
      seen.add(tn);
      methods.add(m);
    }
    if (diverse.length >= PILOT_SIZE) break;
  }
  return diverse.slice(0, PILOT_SIZE);
}

function saveJson(name, data) {
  fs.mkdirSync(WIP, { recursive: true });
  const p = path.join(WIP, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

async function runAudit(remitos) {
  const jun = junRemitos(remitos);
  const mpAll = jun.filter((r) => isMpPaymentMethod(r.metodoDePago));
  const summary = summarizeJunMp(remitos);
  const rows = mpAll.map(toAuditRow);

  console.log("=== FASE J.4 — Auditoría MP Jun 01–06 (dryRun) ===");
  console.table(summary);
  console.log("\nDetalle MP (método Mercado Pago):");
  console.table(rows);

  const out = {
    generatedAt: new Date().toISOString(),
    phase: "audit",
    range: { from: JUN_FROM, to: JUN_TO },
    summary,
    rows,
  };
  const file = saveJson("fase-j4-mp-junio-audit.json", out);
  console.log("\nGuardado:", file);
  return { summary, rows, pending: mpEligiblePending(remitos) };
}

async function runPilot(remitos) {
  const pre = summarizeJunMp(remitos);
  const pending = mpEligiblePending(remitos);
  const pilotTns = pickPilotTns(pending);

  console.log("=== FASE J.4 — Piloto MP (5 órdenes) ===");
  console.log("TN piloto:", pilotTns.join(", "));
  console.table(pre);

  const allResults = [];
  for (let i = 0; i < pilotTns.length; i++) {
    const tn = pilotTns[i];
    console.log(`\n[${i + 1}/${pilotTns.length}] TN ${tn}`);
    const batch = await applyTnWithFallback(tn, remitos);
    allResults.push(...batch);
    for (const r of batch) {
      console.log(
        `  HTTP ${r.http} | ${r.status} | mpPaymentId=${r.mpPaymentId ?? "—"} | ${r.error ?? r.reason ?? "ok"}`
      );
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const remitosAfter = await fetchRemitos();
  const post = summarizeJunMp(remitosAfter);
  const validation = pilotTns.map((tn) => {
    const r = remitosAfter.find((x) => String(x.tnOrderId).trim() === tn);
    return r
      ? {
          TN_ORDER_ID: tn,
          idRemito: r.idRemito,
          mpPaymentId: r.mpPaymentId ?? "",
          mpStatus: r.mpStatus ?? "",
          mpNetoRealOrden: r.mpNetoRealOrden ?? "",
          mpFeeTotalReal: r.mpFeeTotalReal ?? "",
          ok: hasMpApplied(r),
        }
      : { TN_ORDER_ID: tn, ok: false, error: "remito_not_found" };
  });

  const summary = {
    processed: pilotTns.length,
    applied: allResults.filter((r) => r.status === "applied").length,
    skipped: allResults.filter((r) => r.status === "skipped").length,
    payment_not_found: allResults.filter((r) => r.status === "payment_not_found").length,
    errors: allResults.filter((r) => r.status === "error").length,
  };

  console.log("\n=== Validación piloto (post-apply) ===");
  console.table(validation);
  console.log("\n=== Resumen piloto ===");
  console.table(summary);
  console.table({ pre, post, mpAppliedDelta: post.mpApplied - pre.mpApplied });

  const out = {
    generatedAt: new Date().toISOString(),
    phase: "pilot",
    pilotTns,
    pre,
    post,
    summary,
    results: allResults,
    validation,
    pilotOk:
      summary.errors === 0 &&
      summary.payment_not_found === 0 &&
      validation.every((v) => v.ok),
  };
  const file = saveJson("fase-j4-mp-junio-pilot.json", out);

  if (!out.pilotOk) {
    console.error("PILOTO FALLÓ — no continuar bulk");
    process.exit(1);
  }
  console.log("\nPiloto OK. Checkpoint:", file);
  return out;
}

async function runBulk() {
  let remitos = await fetchRemitos();
  const pre = summarizeJunMp(remitos);
  let pending = mpEligiblePending(remitos);
  const uniqueTns = [...new Set(pending.map((r) => String(r.tnOrderId).trim()))];

  console.log("=== FASE J.4 — Bulk MP Junio ===");
  console.log("Pendientes:", uniqueTns.length);
  console.table(pre);

  const allResults = [];
  const checkpoints = [];
  let blockNum = 0;

  while (uniqueTns.length > 0) {
    blockNum++;
    const block = uniqueTns.splice(0, BLOCK_SIZE);
    console.log(`\n--- Bloque ${blockNum} (${block.length} TN) ---`);

    for (let i = 0; i < block.length; i++) {
      const tn = block[i];
      console.log(`[B${blockNum} ${i + 1}/${block.length}] TN ${tn}`);
      const row = await applyOne(tn);
      allResults.push(row);
      const last = row;
      console.log(
        `  ${last.status} | mpPaymentId=${last.mpPaymentId ?? "—"} | ${last.error ?? "ok"}`
      );
      await new Promise((r) => setTimeout(r, 500));
    }

    remitos = await fetchRemitos();
    const post = summarizeJunMp(remitos);
    pending = mpEligiblePending(remitos);
    uniqueTns.length = 0;
    uniqueTns.push(
      ...new Set(pending.map((r) => String(r.tnOrderId).trim()))
    );

    const cp = {
      block: blockNum,
      processedInBlock: block.length,
      mpApplied: post.mpApplied,
      mpPending: post.mpPending,
      remainingTns: uniqueTns.length,
      blockApplied: allResults.filter((r) => r.status === "applied").length,
      blockErrors: allResults.filter(
        (r) => r.status === "error" || r.status === "payment_not_found"
      ).length,
    };
    checkpoints.push(cp);
    console.table(cp);
    saveJson(`fase-j4-mp-junio-block-${blockNum}.json`, {
      checkpoint: cp,
      blockTns: block,
      results: allResults.slice(-block.length * 2),
    });
  }

  const remitosFinal = await fetchRemitos();
  const final = summarizeJunMp(remitosFinal);

  const summary = {
    pre,
    final,
    mpAppliedDelta: final.mpApplied - pre.mpApplied,
    totalPosts: allResults.length,
    applied: allResults.filter((r) => r.status === "applied").length,
    skipped: allResults.filter((r) => r.status === "skipped").length,
    payment_not_found: allResults.filter((r) => r.status === "payment_not_found").length,
    errors: allResults.filter((r) => r.status === "error").length,
    blocks: blockNum,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "bulk_complete",
    summary,
    checkpoints,
    results: allResults,
    failures: allResults.filter(
      (r) => r.status === "error" || r.status === "payment_not_found"
    ),
  };
  const file = saveJson("fase-j4-mp-junio-final.json", report);

  console.log("\n=== INFORME FINAL J.4 ===");
  console.table(summary);
  console.log("Artefacto:", file);

  if (final.mpPending > 0 || summary.errors + summary.payment_not_found > 0) {
    process.exit(1);
  }
}

async function main() {
  console.log("PROD:", PROD);
  console.log("PHASE:", PHASE);
  console.log("---");

  const remitos = await fetchRemitos();

  if (PHASE === "audit") {
    await runAudit(remitos);
    return;
  }

  if (PHASE === "pilot") {
    await runPilot(remitos);
    return;
  }

  if (PHASE === "bulk") {
    await runBulk();
    return;
  }

  if (PHASE === "all") {
    await runAudit(remitos);
    const remitos2 = await fetchRemitos();
    await runPilot(remitos2);
    await runBulk();
    return;
  }

  console.error("Fase inválida. Usar: audit | pilot | bulk | all");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
