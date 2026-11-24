/**
 * El neto de la prenda ya trae descuento, costo de Mercado Pago y el 0,6 %.
 * El envío registrado en Shipping Owner Cost se resta una sola vez.
 * Meta se resta solo cuando hay días guardados de la cuenta de 8CHOQ.
 */

export type PanelRentabilidad = {
  ventasBrutas: number;
  descuentos: number;
  costosMp: number;
  deduccionTransferencia: number;
  netoPrendas: number;
  netoAntesDeMeta: number;
  netoFinal: number | null;
  cierra: boolean;
  envios: {
    estado: "registrado" | "sin_datos";
    entraEnElNeto: boolean;
    registrado8q: number | null;
    cobradoCliente: number | null;
    sinEtiqueta: number | null;
    corte: "cabecera" | "prenda" | null;
  };
  meta: {
    estado: "sin_conectar" | "conectado";
    gasto: number | null;
    compras: number | null;
    valorCompras: number | null;
    impresiones: number | null;
    clics: number | null;
    cpa: number | null;
    roas: number | null;
    entraEnElNeto: boolean;
  };
  costoProductos: {
    estado: "incompleto" | "completo";
    cobertura: number;
    monto: number | null;
    entraEnElNeto: boolean;
    unidades: number;
    unidadesConCosto: number;
    unidadesSinCosto: number;
  };
  resultadoDirecto: number | null;
  margenBruto: null;
};

export function armarPanel(input: {
  bruto: number;
  descuentos: number;
  netoPrenda: number;
  netoReal: number;
  costoMp: number;
  envioCliente: number | null;
  envioRegistrado8q: number | null;
  sinEtiqueta: number | null;
  corteEnvio?: "cabecera" | "prenda" | null;
  unidades: number;
  unidadesConCosto: number;
  cmvRegistrado?: number | null;
  metaGasto?: number | null;
  metaCompras?: number | null;
  metaValor?: number | null;
  metaImpresiones?: number | null;
  metaClics?: number | null;
  metaCpa?: number | null;
  metaRoas?: number | null;
  metaEntra?: boolean;
}): PanelRentabilidad {
  const cobro = round2(input.netoPrenda - input.netoReal);
  const deduccion = round2(cobro - input.costoMp);
  const comercial = round2(input.bruto - input.descuentos);
  const reconstruido = round2(input.netoReal + input.costoMp + deduccion);
  const cierra = Math.abs(comercial - input.netoPrenda) <= 0.02 && Math.abs(reconstruido - input.netoPrenda) <= 0.02 && deduccion >= -0.02;
  const unidades = input.unidades;
  const conCosto = Math.min(Math.max(input.unidadesConCosto, 0), unidades);
  const cmv = input.cmvRegistrado ?? null;
  const envio = input.envioRegistrado8q;
  const envioEntra = envio != null;
  const netoAntesDeMeta = round2(input.netoReal - (envioEntra ? envio : 0));
  const gastoMeta = input.metaGasto;
  const restaMeta = gastoMeta != null && input.metaEntra !== false;
  const netoFinal = restaMeta ? round2(netoAntesDeMeta - gastoMeta) : null;
  const metaConectada = gastoMeta != null;
  return {
    ventasBrutas: input.bruto,
    descuentos: input.descuentos,
    costosMp: input.costoMp,
    deduccionTransferencia: deduccion,
    netoPrendas: input.netoReal,
    netoAntesDeMeta,
    netoFinal,
    cierra,
    envios: {
      estado: envioEntra ? "registrado" : "sin_datos",
      entraEnElNeto: envioEntra,
      registrado8q: envio,
      cobradoCliente: input.envioCliente,
      sinEtiqueta: input.sinEtiqueta,
      corte: envioEntra ? input.corteEnvio ?? "cabecera" : null,
    },
    meta: {
      estado: metaConectada ? "conectado" : "sin_conectar",
      gasto: metaConectada ? input.metaGasto ?? null : null,
      compras: metaConectada ? input.metaCompras ?? null : null,
      valorCompras: metaConectada ? input.metaValor ?? null : null,
      impresiones: metaConectada ? input.metaImpresiones ?? null : null,
      clics: metaConectada ? input.metaClics ?? null : null,
      cpa: metaConectada ? input.metaCpa ?? null : null,
      roas: metaConectada ? input.metaRoas ?? null : null,
      entraEnElNeto: restaMeta,
    },
    costoProductos: {
      estado: unidades > 0 && conCosto === unidades && cmv != null ? "completo" : "incompleto",
      cobertura: unidades === 0 ? 0 : conCosto / unidades,
      monto: conCosto > 0 && cmv != null ? cmv : null,
      entraEnElNeto: unidades > 0 && conCosto === unidades && cmv != null && restaMeta,
      unidades,
      unidadesConCosto: conCosto,
      unidadesSinCosto: Math.max(unidades - conCosto, 0),
    },
    resultadoDirecto: unidades > 0 && conCosto === unidades && cmv != null && netoFinal != null && restaMeta
      ? round2(netoFinal - cmv)
      : null,
    margenBruto: null,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
