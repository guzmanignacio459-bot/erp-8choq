import { describe, expect, it } from "vitest";

import { costoVigencia, skusDeLaCarga } from "./costos";

describe("vigencia de costo", () => {
  it("no convierte un vacío en cero", () => {
    expect(costoVigencia("directo", { materiaPrima: null, manoObra: null, avios: null, otros: null, costoUnitario: null }).completo).toBe(false);
    expect(costoVigencia("desglosado", { materiaPrima: 10, manoObra: null, avios: 1, otros: 1, costoUnitario: 12 }).costoUnitario).toBeNull();
  });

  it("suma el desglose solo cuando las cuatro partes están", () => {
    expect(costoVigencia("desglosado", { materiaPrima: 10, manoObra: 4, avios: 1.5, otros: 0.5, costoUnitario: null })).toEqual({ costoUnitario: 16, completo: true });
  });

  it("no arrastra variantes si el usuario no lo pidió", () => {
    expect(skusDeLaCarga("A", ["B", "C"], false)).toEqual(["A"]);
    expect(skusDeLaCarga("A", ["B", "A"], true)).toEqual(["A", "B"]);
  });
});
