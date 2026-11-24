import { authorizeCron8q, type CronDecision } from "./meta-8q-cron.ts";

export const EXPRESION_PILAR = "*/15 * * * *";
export const CURSOR_PILAR = "pilar_8q_sync_cursor";

export function authorizePilar8q(input: {
  authorization: string | null;
  mode: string | undefined;
  secret: string;
}): CronDecision {
  return authorizeCron8q(input);
}

/** La primera escritura real todavía no está validada. El cron no puede insertar. */
export function escrituraPilarHabilitada(): boolean {
  return false;
}
