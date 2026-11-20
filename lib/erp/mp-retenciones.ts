/**
 * Tipos y acceso tipado. La cuenta vive en mp-retenciones.mjs.
 */

import { impuestoConciliable as impuestoConciliableJs } from "./mp-retenciones.mjs";

export type RetencionMp = {
  name: string;
  amount: number;
};

export type ImpuestoConciliable = {
  taxesAmount: number;
  retenciones: RetencionMp[];
  retencionesTotal: number;
  taxTotal: number;
  adicionales: number;
  motivo: string;
};

export function impuestoConciliable(mp: unknown): ImpuestoConciliable {
  return impuestoConciliableJs(mp);
}
