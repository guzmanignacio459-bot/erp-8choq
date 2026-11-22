import { describe, expect, it, vi } from "vitest";

import {
  credencialesMeta8q,
  elegirCuenta8q,
  guardarMetricasMeta8q,
  listarCuentasMeta8q,
  permisosDeLectura,
  UPSERT_DIARIO,
  validarMeta8q,
  estadoToken,
  planDeLectura,
  ventanaIncremental,
} from "./meta-8q";

const ENV = {
  META_8Q_APP_ID: "app-8q",
  META_8Q_APP_SECRET: "secreto-8q",
  META_8Q_ACCESS_TOKEN: "token-de-prueba-8q-123456",
  META_8Q_AD_ACCOUNT_ID: "123",
};

describe("meta 8q", () => {
  it("no llama a Graph si faltan las variables propias", async () => {
    const fetchImpl = vi.fn();
    const resultado = await validarMeta8q({}, fetchImpl);
    expect(resultado.estado).toBe("sin_conectar");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rechaza ads_management antes de pedir insights", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/me/permissions")) {
        return json({ data: [{ permission: "ads_read", status: "granted" }, { permission: "ads_management", status: "granted" }] });
      }
      throw new Error("no debia pedir insights");
    });
    const resultado = await validarMeta8q(ENV, fetchImpl as typeof fetch);
    expect(resultado).toEqual({ estado: "rechazada", motivo: "ads_management" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("lee un día de la cuenta y no escribe", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).not.toContain(ENV.META_8Q_ACCESS_TOKEN);
      if (url.includes("/insights")) expect(url).toContain("/act_123/insights");
      if (url.includes("/me/permissions")) {
        return json({ data: [{ permission: "ads_read", status: "granted" }] });
      }
      return json({
        data: [{
          date_start: "2026-11-20",
          spend: "1500.50",
          impressions: "1000",
          clicks: "40",
          account_currency: "ARS",
          actions: [{ action_type: "purchase", value: "2" }],
          action_values: [{ action_type: "purchase", value: "8000.00" }],
          cost_per_action_type: [{ action_type: "purchase", value: "750.25" }],
          purchase_roas: [{ action_type: "omni_purchase", value: "5.33" }],
        }],
      });
    });
    const resultado = await validarMeta8q(ENV, fetchImpl as typeof fetch, new Date("2026-11-21T15:00:00Z"));
    expect(resultado.estado).toBe("leida");
    if (resultado.estado !== "leida") return;
    expect(resultado.fila.gasto).toBe(1500.5);
    expect(resultado.fila.compras).toBe(2);
    expect(resultado.fila.valorCompras).toBe(8000);
    expect(resultado.fila.impresiones).toBe(1000);
    expect(resultado.fila.clics).toBe(40);
    expect(resultado.fila.cpa).toBe(750.25);
  });

  it("la ventana relee dos días y el guardado no corre sin confirmación", async () => {
    expect(ventanaIncremental(null, "2026-11-21")).toEqual({ since: "2026-11-14", until: "2026-11-20" });
    expect(ventanaIncremental("2026-11-18", "2026-11-21")).toEqual({ since: "2026-11-16", until: "2026-11-20" });
    expect(planDeLectura("2026-11-21", "2026-11-21")).toEqual({ since: "2026-11-19", until: "2026-11-21" });
    expect(estadoToken("2027-01-20", "2026-11-21")).toBe("vigente");
    expect(estadoToken("2026-11-25", "2026-11-21")).toBe("por_vencer");
    expect(estadoToken("2026-11-20", "2026-11-21")).toBe("vencido");
    const ejecutar = vi.fn(async () => undefined);
    const quieto = await guardarMetricasMeta8q({
      confirmar: false,
      cuenta: "123",
      filas: [{ dia: "2026-11-20", campanaId: null, campanaNombre: null, gasto: 10, impresiones: 1, clics: 1, compras: 0, valorCompras: 0, cpa: null, roas: null, moneda: "ARS", atribucion: null }],
      ejecutar,
    });
    expect(quieto.estado).toBe("no_aplicado");
    expect(ejecutar).not.toHaveBeenCalled();
    expect(UPSERT_DIARIO).toContain("meta_8q_insight_daily");
    expect(UPSERT_DIARIO).not.toContain("meta_insight");
  });

  it("no acepta una cuenta con otro formato", () => {
    expect(credencialesMeta8q({ ...ENV, META_8Q_AD_ACCOUNT_ID: "act_de_otro" }).ok).toBe(false);
    expect(permisosDeLectura([{ permission: "ads_read", status: "granted" }])).toEqual({ ok: true });
  });

  it("elige solo la cuenta que se llama 8CHOQ Argentina", async () => {
    expect(elegirCuenta8q([
      { id: "act_1", nombre: "8CHOQ Argentina" },
      { id: "act_2", nombre: "Otra tienda" },
    ])).toEqual({ estado: "unica", id: "act_1" });
    expect(elegirCuenta8q([{ id: "act_1", nombre: "8CHOQ" }]).estado).toBe("ninguna");
    expect(elegirCuenta8q([
      { id: "act_1", nombre: "8CHOQ Argentina" },
      { id: "act_2", nombre: "8CHOQ Argentina 2" },
    ]).estado).toBe("ambiguo");
    const fetchImpl = vi.fn(async () => json({ data: [{ permission: "ads_read", status: "granted" }] }));
    const sinToken = await listarCuentasMeta8q({}, fetchImpl as typeof fetch);
    expect(sinToken.estado).toBe("sin_conectar");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
