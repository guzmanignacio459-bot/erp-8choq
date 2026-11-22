import { describe, expect, it } from "vitest";

import { armarPanel } from "./rentabilidad";

describe("panel de rentabilidad", () => {
  it("resta el envío registrado y deja Meta afuera", () => {
    const panel = armarPanel({
      bruto: 45626822.5,
      descuentos: 9446220.18,
      netoPrenda: 36180602.32,
      netoReal: 31807695.94,
      costoMp: 4324352.89,
      envioCliente: 1774171.99,
      envioRegistrado8q: 2375252.32,
      sinEtiqueta: 7,
      unidades: 889,
      unidadesConCosto: 0,
    });
    expect(panel.cierra).toBe(true);
    expect(panel.netoPrendas).toBe(31807695.94);
    expect(panel.netoAntesDeMeta).toBe(29432443.62);
    expect(panel.netoFinal).toBeNull();
    expect(panel.deduccionTransferencia).toBe(48553.49);
    expect(panel.ventasBrutas - panel.descuentos).toBeCloseTo(panel.netoPrendas + panel.costosMp + panel.deduccionTransferencia, 2);
    expect(panel.envios.entraEnElNeto).toBe(true);
    expect(panel.envios.estado).toBe("registrado");
    expect(panel.envios.registrado8q).toBe(2375252.32);
    expect(panel.meta.gasto).toBeNull();
    expect(panel.costoProductos.monto).toBeNull();
    expect(panel.costoProductos.cobertura).toBe(0);
    expect(panel.margenBruto).toBeNull();
  });

  it("resta Meta solo cuando el gasto entra en el neto", () => {
    const base = {
      bruto: 45626822.5,
      descuentos: 9446220.18,
      netoPrenda: 36180602.32,
      netoReal: 31807695.94,
      costoMp: 4324352.89,
      envioCliente: 1774171.99,
      envioRegistrado8q: 2375252.32,
      sinEtiqueta: 7,
      unidades: 889,
      unidadesConCosto: 0,
      metaGasto: 12091063.41,
      metaCompras: 293,
      metaValor: 40282507.55,
      metaRoas: 3.33,
      metaCpa: 41266.43,
    };
    const parcial = armarPanel(base);
    expect(parcial.netoFinal).toBe(17341380.21);
    expect(parcial.meta.entraEnElNeto).toBe(true);
    const filtrado = armarPanel({ ...base, metaEntra: false });
    expect(filtrado.netoFinal).toBeNull();
    expect(filtrado.meta.estado).toBe("conectado");
    expect(filtrado.meta.gasto).toBe(12091063.41);
    expect(filtrado.meta.entraEnElNeto).toBe(false);
  });

  it("no resta un envío ausente ni muestra Meta en cero", () => {
    const panel = armarPanel({
      bruto: 100,
      descuentos: 10,
      netoPrenda: 90,
      netoReal: 80,
      costoMp: 10,
      envioCliente: null,
      envioRegistrado8q: null,
      sinEtiqueta: null,
      unidades: 1,
      unidadesConCosto: 0,
    });
    expect(panel.netoAntesDeMeta).toBe(80);
    expect(panel.envios.estado).toBe("sin_datos");
    expect(panel.meta.estado).toBe("sin_conectar");
    expect(panel.netoFinal).toBeNull();
  });
});
