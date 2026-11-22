import { describe, expect, it } from "vitest";

import { accesoValido, secretoConfigurado } from "./acceso";
import { authorizeCron8q, metaAtrasada, ventanaAutomatica } from "./meta-8q-cron";

describe("cron de Meta 8Q", () => {
  it("permanece apagado aunque llegue un secreto", () => {
    const decision = authorizeCron8q({
      authorization: "Bearer una-clave-larga-de-prueba",
      mode: undefined,
      secret: "una-clave-larga-de-prueba",
    });
    expect(decision).toEqual({ ok: false, status: 403, error: "sincronizacion_apagada" });
  });

  it("con el modo prendido exige el secreto propio", () => {
    expect(authorizeCron8q({
      authorization: "Bearer otra-clave-distinta-8q",
      mode: "automatico",
      secret: "secreto-cron-8q-de-prueba",
    })).toEqual({ ok: false, status: 401, error: "no_autorizado" });
    expect(authorizeCron8q({
      authorization: "Bearer secreto-cron-8q-de-prueba",
      mode: "automatico",
      secret: "secreto-cron-8q-de-prueba",
    })).toEqual({ ok: true });
  });

  it("recupera los días faltantes desde el cursor y no vuelve a octubre", () => {
    expect(ventanaAutomatica("2026-11-10", "2026-11-22")).toEqual({
      since: "2026-11-08",
      until: "2026-11-22",
    });
    expect(ventanaAutomatica(null, "2026-11-22")).toBeNull();
  });

  it("marca la lectura como atrasada después de media hora", () => {
    const ahora = Date.parse("2026-11-22T05:00:00.000Z");
    expect(metaAtrasada("2026-11-22T04:40:00.000Z", ahora)).toBe(false);
    expect(metaAtrasada("2026-11-22T04:00:00.000Z", ahora)).toBe(true);
    expect(metaAtrasada(null, ahora)).toBe(true);
  });

  it("el acceso publicado exige una clave larga", () => {
    expect(secretoConfigurado("corta")).toBe(false);
    expect(accesoValido("clave-dashboard-8q-prueba", "clave-dashboard-8q-prueba")).toBe(true);
    expect(accesoValido("otra", "clave-dashboard-8q-prueba")).toBe(false);
  });
});
