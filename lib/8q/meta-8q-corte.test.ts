import { describe, expect, it } from "vitest";

import { elegirCorteMeta, type FilaMetaLocal } from "./meta-8q-corte";

const diario: FilaMetaLocal[] = [
  { dia: "2026-10-01", gasto: 80, compras: 1, valorCompras: 200, impresiones: 8, clics: 2 },
  { dia: "2026-11-21", gasto: 90, compras: 1, valorCompras: 400, impresiones: 10, clics: 3 },
];

const campanas: FilaMetaLocal[] = [
  { dia: "2026-10-01", campanaId: "a", campanaNombre: "A", gasto: 50, compras: 1, valorCompras: 100, impresiones: 4, clics: 1 },
  { dia: "2026-10-01", campanaId: "a", campanaNombre: "A", gasto: 30, compras: 0, valorCompras: 0, impresiones: 2, clics: 1 },
  { dia: "2026-11-21", campanaId: "b", campanaNombre: "B", gasto: 90, compras: 1, valorCompras: 400, impresiones: 10, clics: 3 },
];

describe("corte local de Meta", () => {
  it("suma los días y deja el rango fuera del neto", () => {
    const corte = elegirCorteMeta({
      diario,
      campanas,
      hoyCuenta: "2026-11-21",
      zona: "America/Los_Angeles",
      resumenes: [{ desde: "2026-10-01", hasta: "2026-11-21", gasto: 999, compras: 9, valorCompras: 999, impresiones: 9, clics: 9, cpa: 1, roas: 1 }],
    }, "2026-10-01", "2026-11-30");
    expect(corte.grano).toBe("diario");
    expect(corte.gasto).toBe(170);
    expect(corte.gastoCerrado).toBe(80);
    expect(corte.gastoAbierto).toBe(90);
    expect(corte.diaAbierto).toBe("2026-11-21");
    expect(corte.campanas.map((campana) => campana.id)).toEqual(["b", "a"]);
    expect(corte.campanas[1]?.gasto).toBe(80);
    expect(corte.campanas[1]?.roas).toBe(1.25);
  });

  it("un mes cerrado no marca un día abierto", () => {
    const corte = elegirCorteMeta({ diario, hoyCuenta: "2026-11-21" }, "2026-10-01", "2026-10-31");
    expect(corte.gasto).toBe(80);
    expect(corte.diaAbierto).toBeNull();
    expect(corte.gastoAbierto).toBeNull();
  });

  it("no inventa cero cuando no hay días", () => {
    expect(elegirCorteMeta({ diario }, "2026-12-01", "2026-12-31").gasto).toBeNull();
  });
});
