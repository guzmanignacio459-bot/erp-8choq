import { readFileSync } from "node:fs";
import { join } from "node:path";

export type FilaMetaLocal = {
  dia: string;
  gasto: number;
  compras: number;
  valorCompras: number;
  impresiones: number;
  clics: number;
  campanaId?: string | null;
  campanaNombre?: string | null;
};

export type ResumenMetaLocal = {
  desde: string;
  hasta: string;
  gasto: number;
  compras: number;
  valorCompras: number;
  impresiones: number | null;
  clics: number | null;
  cpa: number | null;
  roas: number | null;
  aviso?: string;
};

export type CampanaMetaLocal = {
  id: string;
  nombre: string;
  gasto: number;
  compras: number;
  valorCompras: number;
  impresiones: number;
  clics: number;
  cpa: number | null;
  roas: number | null;
};

export type DiaMetaLocal = {
  dia: string;
  gasto: number;
  abierto: boolean;
};

export type CorteMetaLocal = {
  gasto: number | null;
  compras: number | null;
  valorCompras: number | null;
  impresiones: number | null;
  clics: number | null;
  cpa: number | null;
  roas: number | null;
  grano: "diario" | "vacio";
  aviso: string;
  campanas: CampanaMetaLocal[];
  gastoCerrado: number | null;
  gastoAbierto: number | null;
  diaAbierto: string | null;
  leidoEl: string | null;
  zona: string;
  serie: DiaMetaLocal[];
};

type ArchivoMetaLocal = {
  resumenes?: ResumenMetaLocal[];
  diario?: FilaMetaLocal[];
  campanas?: FilaMetaLocal[];
  hoyCuenta?: string;
  leidoEl?: string;
  zona?: string;
};

const vacio: CorteMetaLocal = {
  gasto: null,
  compras: null,
  valorCompras: null,
  impresiones: null,
  clics: null,
  cpa: null,
  roas: null,
  grano: "vacio",
  aviso: "",
  campanas: [],
  gastoCerrado: null,
  gastoAbierto: null,
  diaAbierto: null,
  leidoEl: null,
  zona: "America/Los_Angeles",
  serie: [],
};

export function elegirCorteMeta(
  archivo: ArchivoMetaLocal,
  from: string,
  to: string
): CorteMetaLocal {
  const zona = archivo.zona || "America/Los_Angeles";
  const diario = (archivo.diario ?? []).filter((fila) => fila.dia >= from && fila.dia <= to);
  const campanas = agruparCampanas(archivo.campanas ?? [], from, to);
  if (diario.length === 0) return { ...vacio, campanas, leidoEl: archivo.leidoEl ?? null, zona };

  const diaAbierto = archivo.hoyCuenta && diario.some((fila) => fila.dia === archivo.hoyCuenta) ? archivo.hoyCuenta : null;
  const abiertos = diaAbierto ? diario.filter((fila) => fila.dia === diaAbierto) : [];
  const cerrados = diaAbierto ? diario.filter((fila) => fila.dia !== diaAbierto) : diario;
  const totales = sumarFilas(diario);
  const abierto = abiertos.length ? sumarFilas(abiertos).gasto : null;
  return {
    ...totales,
    grano: "diario",
    aviso: diaAbierto
      ? `Suma de los días de la cuenta. El ${diaAbierto} sigue abierto en Los Ángeles y puede cambiar. El total de rango no se suma otra vez. Meta no devolvió impuestos.`
      : "Suma de los días cerrados de la cuenta en Los Ángeles. El total de rango no se suma otra vez. Meta no devolvió impuestos.",
    campanas,
    gastoCerrado: cerrados.length ? sumarFilas(cerrados).gasto : null,
    gastoAbierto: abierto,
    diaAbierto,
    leidoEl: archivo.leidoEl ?? null,
    zona,
    serie: diario.map((fila) => ({ dia: fila.dia, gasto: fila.gasto, abierto: fila.dia === diaAbierto })),
  };
}

export function leerMetaLocal(from: string, to: string): CorteMetaLocal {
  try {
    const raw = readFileSync(join(process.cwd(), "lib/8q/meta-8q-local.json"), "utf8");
    return elegirCorteMeta(JSON.parse(raw) as ArchivoMetaLocal, from, to);
  } catch {
    return vacio;
  }
}

function agruparCampanas(filas: FilaMetaLocal[], from: string, to: string): CampanaMetaLocal[] {
  const porId = new Map<string, CampanaMetaLocal>();
  for (const fila of filas) {
    if (fila.dia < from || fila.dia > to || fila.gasto <= 0 || !fila.campanaId) continue;
    const previa = porId.get(fila.campanaId);
    if (!previa) {
      porId.set(fila.campanaId, {
        id: fila.campanaId,
        nombre: fila.campanaNombre ?? fila.campanaId,
        gasto: fila.gasto,
        compras: fila.compras,
        valorCompras: fila.valorCompras,
        impresiones: fila.impresiones,
        clics: fila.clics,
        cpa: fila.compras > 0 ? round2(fila.gasto / fila.compras) : null,
        roas: fila.gasto > 0 ? round2(fila.valorCompras / fila.gasto) : null,
      });
      continue;
    }
    previa.gasto = round2(previa.gasto + fila.gasto);
    previa.compras += fila.compras;
    previa.valorCompras = round2(previa.valorCompras + fila.valorCompras);
    previa.impresiones += fila.impresiones;
    previa.clics += fila.clics;
    previa.cpa = previa.compras > 0 ? round2(previa.gasto / previa.compras) : null;
    previa.roas = previa.gasto > 0 ? round2(previa.valorCompras / previa.gasto) : null;
  }
  return [...porId.values()].sort((a, b) => b.gasto - a.gasto);
}

function sumarFilas(filas: FilaMetaLocal[]): Pick<CorteMetaLocal, "gasto" | "compras" | "valorCompras" | "impresiones" | "clics" | "cpa" | "roas"> {
  const gasto = round2(filas.reduce((sum, fila) => sum + fila.gasto, 0));
  const compras = filas.reduce((sum, fila) => sum + fila.compras, 0);
  const valor = round2(filas.reduce((sum, fila) => sum + fila.valorCompras, 0));
  return {
    gasto,
    compras,
    valorCompras: valor,
    impresiones: filas.reduce((sum, fila) => sum + fila.impresiones, 0),
    clics: filas.reduce((sum, fila) => sum + fila.clics, 0),
    cpa: compras > 0 ? round2(gasto / compras) : null,
    roas: gasto > 0 ? round2(valor / gasto) : null,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
