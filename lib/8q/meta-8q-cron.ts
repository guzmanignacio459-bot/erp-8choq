import { createHash, timingSafeEqual } from "node:crypto";

import { planDeLectura } from "./meta-8q.ts";

export const CUENTA_8Q = "act_10202653580793000";
export const EXPRESION_FUTURA = "*/15 * * * *";
export const FRESCURA_MS = 30 * 60 * 1000;

export type CronDecision =
  | { ok: true }
  | { ok: false; status: 401 | 403; error: "no_autorizado" | "sincronizacion_apagada" };

export function authorizeCron8q(input: {
  authorization: string | null;
  mode: string | undefined;
  secret: string;
}): CronDecision {
  if (input.mode !== "automatico") {
    return { ok: false, status: 403, error: "sincronizacion_apagada" };
  }
  const provided = bearer(input.authorization);
  if (!input.secret || !provided || !mismoSecreto(provided, input.secret)) {
    return { ok: false, status: 401, error: "no_autorizado" };
  }
  return { ok: true };
}

/** Relee el día abierto y los dos anteriores. Si el cursor quedó atrás, el hasta es hoy y entran los días faltantes. Sin cursor no hay lectura. */
export function ventanaAutomatica(ultimoDia: string | null, hoy: string): { since: string; until: string } | null {
  if (!ultimoDia) return null;
  return planDeLectura(ultimoDia, hoy);
}

export function metaAtrasada(leido: string | null, ahora: number): boolean {
  if (!leido) return true;
  const marca = Date.parse(leido);
  if (Number.isNaN(marca)) return true;
  return ahora - marca > FRESCURA_MS;
}

function bearer(header: string | null): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (scheme !== "Bearer" || !value || value.includes(" ")) return null;
  return value;
}

function mismoSecreto(provisto: string, esperado: string): boolean {
  const left = createHash("sha256").update(provisto).digest();
  const right = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(left, right);
}
