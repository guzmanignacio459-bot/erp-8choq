import { describe, expect, it } from "vitest";

import { decidirFila, fechaDeSerial, filaEscribible, leerImporte } from "./pilar-escritura";

describe("escritor incremental de PILAR", () => {
  it("no pisa una fila guardada y separa los otros casos", () => {
    expect(decidirFila({ id: "REMITOS:1", completa: true, yaGuardada: true, hashNuevo: "a", hashGuardado: "a", vista: false })).toBe("existente");
    expect(decidirFila({ id: "REMITOS:1", completa: true, yaGuardada: true, hashNuevo: "b", hashGuardado: "a", vista: false })).toBe("modificada");
    expect(decidirFila({ id: "REMITOS:9", completa: true, yaGuardada: false, hashNuevo: "c", hashGuardado: null, vista: false })).toBe("nueva");
    expect(decidirFila({ id: "", completa: true, yaGuardada: false, hashNuevo: null, hashGuardado: null, vista: false })).toBe("incompleta");
    expect(decidirFila({ id: "REMITOS:9", completa: false, yaGuardada: false, hashNuevo: null, hashGuardado: null, vista: false })).toBe("incompleta");
    expect(decidirFila({ id: "REMITOS:9", completa: true, yaGuardada: false, hashNuevo: "c", hashGuardado: null, vista: true })).toBe("duplicada");
    expect(filaEscribible("nueva")).toBe(true);
    expect(["existente", "modificada", "incompleta", "duplicada"].every((estado) => !filaEscribible(estado as "existente"))).toBe(true);
  });

  it("un importe vacío no es cero y el serial de la planilla es una fecha", () => {
    expect(leerImporte("")).toBeNull();
    expect(leerImporte("0")).toBe(0);
    expect(leerImporte("12,5")).toBe(12.5);
    const serial = (Date.UTC(2026, 7, 1) - Date.UTC(1899, 11, 30)) / 86400000;
    expect(fechaDeSerial(serial)).toBe("2026-08-01");
  });
});
