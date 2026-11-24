import { leerImporte } from "./pilar-escritura.ts";

export type ProductoCosto = {
  dueno: string;
  sku: string;
  nombre: string;
  unidades: number;
  neto: number | null;
  conCosto: boolean;
};

export type ModalidadCosto = "directo" | "desglosado";

export type PartesCosto = {
  materiaPrima: number | null;
  manoObra: number | null;
  avios: number | null;
  otros: number | null;
  costoUnitario: number | null;
};

export function costoVigencia(modalidad: ModalidadCosto, partes: PartesCosto): { costoUnitario: number | null; completo: boolean } {
  if (modalidad === "directo") {
    return { costoUnitario: partes.costoUnitario, completo: partes.costoUnitario != null };
  }
  const desglose = [partes.materiaPrima, partes.manoObra, partes.avios, partes.otros];
  if (desglose.some((parte) => parte == null)) return { costoUnitario: null, completo: false };
  const suma = Math.round(desglose.reduce<number>((total, parte) => total + (parte ?? 0), 0) * 100) / 100;
  return { costoUnitario: suma, completo: true };
}

export function importesDelFormulario(form: FormData): Record<string, number | null> {
  return {
    materia_prima: leerImporte(String(form.get("materia_prima") ?? "")),
    mano_obra: leerImporte(String(form.get("mano_obra") ?? "")),
    avios: leerImporte(String(form.get("avios") ?? "")),
    otros: leerImporte(String(form.get("otros") ?? "")),
    costo_unitario: leerImporte(String(form.get("costo_unitario") ?? "")),
  };
}

export function skusDeLaCarga(sku: string, variantes: string[], conjunto: boolean): string[] {
  const propio = sku.trim();
  if (!propio) return [];
  if (!conjunto) return [propio];
  return [...new Set([propio, ...variantes.map((item) => item.trim()).filter(Boolean)])];
}
