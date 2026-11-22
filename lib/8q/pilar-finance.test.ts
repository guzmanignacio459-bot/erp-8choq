import fs from "node:fs";

import { describe, expect, it } from "vitest";

import { cents, monthControl, PILAR_CONTROLS, resolvePilarPeriod } from "./pilar-finance";
import { OPEN_PERIODS, openCoverage } from "./pilar-open";

describe("finanzas PILAR", () => {
  it("abre en agosto y septiembre de 2026", () => {
    const period = resolvePilarPeriod({});
    expect(period.ok).toBe(true);
    if (!period.ok) return;
    expect(period.from).toBe("2026-08-01");
    expect(period.to).toBe("2026-09-30");
  });

  it("los controles de los dos meses suman el total", () => {
    expect(cents(PILAR_CONTROLS.agosto.ventas) + cents(PILAR_CONTROLS.septiembre.ventas)).toBe(
      cents(PILAR_CONTROLS.total.ventas)
    );
    expect(PILAR_CONTROLS.agosto.remitos + PILAR_CONTROLS.septiembre.remitos).toBe(PILAR_CONTROLS.total.remitos);
    expect(PILAR_CONTROLS.agosto.prendas + PILAR_CONTROLS.septiembre.prendas).toBe(PILAR_CONTROLS.total.prendas);
  });

  it("reconoce el lote y rechaza un mes corrido", () => {
    expect(monthControl("2026-08", 295, 903, "33933430.69")).toBe("coincide");
    expect(monthControl("2026-09", 189, 653, "25125589.74")).toBe("coincide");
    expect(monthControl("2026-08", 297, 909, "33933430.69")).toBe("distinto");
  });

  it("octubre y noviembre quedan fuera del total cerrado", () => {
    expect(openCoverage("2026-08-01", "2026-09-30")).toBe("cerrado");
    expect(openCoverage("2026-08-01", "2026-11-19")).toBe("parcial");
    expect(openCoverage("2026-10-01", "2026-11-19")).toBe("abierto");
    expect(OPEN_PERIODS.octubre.remitos).toBe(0);
    expect(OPEN_PERIODS.noviembre.remitos).toBe(0);
    expect(OPEN_PERIODS.octubre.pagadas + OPEN_PERIODS.noviembre.pagadas).toBe(302);
  });

  it("la lectura de ventas no toca las órdenes del ERP", () => {
    const source = fs.readFileSync(new URL("./pilar-finance-read.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/tn_orders|tn_total|payments|stock_movements|sync_state/i);
    expect(source).toMatch(/pilar_remitos/);
    expect(source).toMatch(/pilar_prendas/);
    expect(source).toMatch(/mp_acreditado_fecha/);
    expect(source).toMatch(/fecha_venta/);
  });
});
