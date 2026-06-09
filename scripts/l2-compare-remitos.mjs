#!/usr/bin/env node
/**
 * L2.1 — Shadow B: comparar remitos GAS vs erp_orders Neon
 *
 * Uso:
 *   npm run l2:compare:remitos
 *   npm run l2:compare:remitos -- --from 2026-04-01 --to 2026-06-08
 *
 * Requiere: ERP_V2_DB_READ=true, DATABASE_URL staging, APPS_SCRIPT_URL
 */
import fs from "fs";
import path from "path";

import { inArtRange } from "./lib/l0-art-date.mjs";
import { fetchListRemitosFull } from "./lib/l0-gas-client.mjs";
import { loadEnvLocal } from "./lib/l0-env.mjs";
import {
  normalizeIdRemito,
  parseAmount,
  pickField,
} from "./lib/l0-parse.mjs";
import { createPrisma, disconnectPrisma } from "./lib/l1-prisma.mjs";

loadEnvLocal();

const DEFAULT_FROM = "2026-04-01";
const DEFAULT_TO = "2026-06-08";
const TOLERANCE = 0.01;

function parseArgs() {
  let from = DEFAULT_FROM;
  let to = DEFAULT_TO;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--from" && process.argv[i + 1]) from = process.argv[++i];
    else if (process.argv[i] === "--to" && process.argv[i + 1]) to = process.argv[++i];
  }
  return { from, to };
}

function assertGate() {
  if (process.env.ERP_V2_DB_READ !== "true") {
    throw new Error("ERP_V2_DB_READ=true required");
  }
  const url = (process.env.DATABASE_URL ?? "").trim();
  if (!url) throw new Error("DATABASE_URL missing");
  for (const re of [/topaz-iota/i, /vercel\.app/i, /\bprod\b/i, /production/i]) {
    if (re.test(url)) throw new Error(`DATABASE_URL blocked (${re})`);
  }
}

function mapGasRemito(row, from, to) {
  const id = normalizeIdRemito(
    pickField(row, ["ID Remito", "ID remito", "idRemito", "id"])
  );
  if (!id) return null;
  const fecha = pickField(row, ["Fecha", "fecha", "fechaISO"]);
  if (fecha && !inArtRange(fecha, from, to)) return null;
  const total = parseAmount(pickField(row, ["Total Final", "totalFinal"]));
  return { idRemito: id, fecha, totalFinal: total };
}

async function fetchNeonRemitos(from, to) {
  const db = createPrisma();
  try {
    const rows = await db.prisma.erpOrder.findMany({
      select: { id: true, fechaErp: true, totalFinalErp: true },
      orderBy: { fechaErp: "asc" },
    });
    return rows
      .map((r) => ({
        idRemito: r.id,
        fecha: r.fechaErp?.toISOString() ?? null,
        totalFinal: Number(r.totalFinalErp),
      }))
      .filter((r) => !r.fecha || inArtRange(r.fecha, from, to));
  } finally {
    await disconnectPrisma(db);
  }
}

async function main() {
  assertGate();
  const { from, to } = parseArgs();

  console.log(`[L2 compare] scope ART ${from}..${to}`);

  const { rows: gasRows, action } = await fetchListRemitosFull();
  const gasMapped = gasRows.map((r) => mapGasRemito(r, from, to)).filter(Boolean);

  const neonMapped = await fetchNeonRemitos(from, to);

  const gasById = new Map(gasMapped.map((r) => [r.idRemito, r]));
  const neonById = new Map(neonMapped.map((r) => [r.idRemito, r]));

  const onlyGas = [...gasById.keys()].filter((id) => !neonById.has(id));
  const onlyNeon = [...neonById.keys()].filter((id) => !gasById.has(id));
  const aligned = [...gasById.keys()].filter((id) => neonById.has(id));

  const totalMismatches = [];
  for (const id of aligned) {
    const g = gasById.get(id);
    const n = neonById.get(id);
    const delta = Math.abs((g?.totalFinal ?? 0) - (n?.totalFinal ?? 0));
    if (delta > TOLERANCE) {
      totalMismatches.push({
        idRemito: id,
        gasTotal: g?.totalFinal ?? 0,
        neonTotal: n?.totalFinal ?? 0,
        delta,
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    scope: { from, to },
    gas: { count: gasMapped.length, action },
    neon: { count: neonMapped.length },
    match: {
      idsAligned: aligned.length,
      onlyGas,
      onlyNeon,
      totalMismatches,
    },
    pass:
      onlyGas.length === 0 &&
      onlyNeon.length === 0 &&
      totalMismatches.length === 0,
  };

  const out = path.join("_wip", "l2-compare-remitos.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  console.log(`[L2 compare] GAS=${gasMapped.length} Neon=${neonMapped.length}`);
  console.log(`[L2 compare] aligned=${aligned.length} onlyGas=${onlyGas.length} onlyNeon=${onlyNeon.length}`);
  console.log(`[L2 compare] totalMismatches=${totalMismatches.length}`);
  console.log(`[L2 compare] pass=${report.pass}`);
  console.log(`[L2 compare] wrote ${out}`);

  if (!report.pass) process.exit(1);
}

main().catch((e) => {
  console.error("[L2 compare] FAIL:", e.message);
  process.exit(1);
});
