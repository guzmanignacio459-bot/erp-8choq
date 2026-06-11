/**
 * Gates read-only ERP V2 → PostgreSQL staging (L2+)
 */

import type { V2DbUrlMeta } from "@/types/erp-v2-api";

const BLOCKED_URL_PATTERNS = [
  /topaz-iota/i,
  /vercel\.app/i,
  /\bprod\b/i,
  /production/i,
];

export type ErpV2GateOk = {
  ok: true;
  urlMeta: V2DbUrlMeta;
};

export type ErpV2GateFail = {
  ok: false;
  status: 503;
  message: string;
};

export type ErpV2GateResult = ErpV2GateOk | ErpV2GateFail;

export function maskDatabaseUrl(url: string): V2DbUrlMeta {
  try {
    const u = new URL(url.replace(/^postgresql:/, "http:"));
    const host = u.hostname;
    const port = u.port || "5432";
    const database = u.pathname.replace(/^\//, "") || "postgres";
    const isNeon = host.includes("neon.tech");
    const isLocal =
      host === "127.0.0.1" || host === "localhost" || port === "5433";
    return {
      host,
      port,
      database,
      provider: isNeon
        ? "neon-staging"
        : isLocal
          ? "local-pglite"
          : "postgres-other",
    };
  } catch {
    return {
      host: "unknown",
      port: "5432",
      database: "postgres",
      provider: "postgres-other",
    };
  }
}

/** Valida gates L2 read — no lanza; retorna 503 payload si falla. */
export function checkErpV2DbRead(): ErpV2GateResult {
  if (process.env.ERP_V2_DB_READ !== "true") {
    return {
      ok: false,
      status: 503,
      message:
        "ERP V2 DB read disabled. Set ERP_V2_DB_READ=true in .env.local (staging only).",
    };
  }

  const url = (process.env.DATABASE_URL ?? "").trim();
  if (!url) {
    return {
      ok: false,
      status: 503,
      message:
        "DATABASE_URL missing. Configure Neon staging in .env.local (never prod).",
    };
  }

  for (const re of BLOCKED_URL_PATTERNS) {
    if (re.test(url)) {
      return {
        ok: false,
        status: 503,
        message: `DATABASE_URL blocked for ERP V2 read (matches ${re.source}). Use staging only.`,
      };
    }
  }

  return { ok: true, urlMeta: maskDatabaseUrl(url) };
}

/** Valida gates M3.1b write — Neon staging + ERP_V2_DB_WRITE=true. */
export function checkErpV2DbWrite(): ErpV2GateResult {
  if (process.env.ERP_V2_DB_WRITE !== "true") {
    return {
      ok: false,
      status: 503,
      message:
        "ERP V2 DB write disabled. Set ERP_V2_DB_WRITE=true in .env.local (staging only).",
    };
  }

  const url = (process.env.DATABASE_URL ?? "").trim();
  if (!url) {
    return {
      ok: false,
      status: 503,
      message:
        "DATABASE_URL missing. Configure Neon staging in .env.local (never prod).",
    };
  }

  for (const re of BLOCKED_URL_PATTERNS) {
    if (re.test(url)) {
      return {
        ok: false,
        status: 503,
        message: `DATABASE_URL blocked for ERP V2 write (matches ${re.source}). Use staging only.`,
      };
    }
  }

  const urlMeta = maskDatabaseUrl(url);
  if (urlMeta.provider !== "neon-staging") {
    return {
      ok: false,
      status: 503,
      message:
        "DATABASE_URL must point to Neon staging (host neon.tech). Local PGlite and prod are blocked for M3.1b write.",
    };
  }

  return { ok: true, urlMeta };
}
