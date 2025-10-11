"use client";

import { useMemo, useState } from "react";

type Talles = {
  S: string;
  M: string;
  L: string;
  XL: string;
  XXL: string;
  XXXL: string;
};

type Item = {
  codigo: string;
  articulo: string;
  aPagar: string; // precio unitario
  talles: Talles;
};

const DEFAULT_ROWS = 10;

const emptyItem = (): Item => ({
  codigo: "",
  articulo: "",
  aPagar: "",
  talles: { S: "0", M: "0", L: "0", XL: "0", XXL: "0", XXXL: "0" },
});

export default function Remito8CHOQ() {
  // ------- Encabezado -------
  const [cliente, setCliente] = useState("");
  const [fecha, setFecha] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [dni, setDni] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [envio, setEnvio] = useState("");
  const [metodoPago, setMetodoPago] = useState("");
  const [provincia, setProvincia] = useState("Mendoza");
  const [costoEnvio, setCostoEnvio] = useState<string>("0");
  const [descuento, setDescuento] = useState<number>(0);

  // ------- Items -------
  const [items, setItems] = useState<Item[]>(
    Array.from({ length: DEFAULT_ROWS }, () => emptyItem())
  );

  // ------- Catálogos -------
  const vendedores = ["Nacho", "Santi", "Paula", "Malena"];
  const envios = [
    "Correo - Sucursal",
    "Correo - Domicilio",
    "Andreani - Sucursal",
    "Andreani - Domicilio",
    "OCA",
    "Send Box",
    "Retira",
    "Domicilio",
  ];
  const metodosPago = [
    "MP 1 cuota",
    "MP 3 cuotas",
    "Transferencia 1",
    "Transferencia 2",
    "Efectivo",
    "Débito",
    "QR",
  ];
  const descuentos = [
    { label: "Sin descuento", value: 0 },
    { label: "Mayorista 5%", value: 5 },
    { label: "Promo 10%", value: 10 },
    { label: "Mayorista 15%", value: 15 },
    { label: "Promo 20%", value: 20 },
  ];

  // ------- Update helpers -------
  const updateItem = (idx: number, key: keyof Item, value: string) => {
    setItems((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  };

  const updateTalle = (idx: number, talle: keyof Item["talles"], value: string) => {
    setItems((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, talles: { ...r.talles, [talle]: value } } : r
      )
    );
  };

  const addRow = () => setItems((prev) => [...prev, emptyItem()]);
  const clearTable = () =>
    setItems(Array.from({ length: DEFAULT_ROWS }, () => emptyItem()));

  // ------- Totales -------
  const {
    totalPrendas,
    subtotal,
    descuentoMonto,
    envioMonto,
    total,
    lineTotals,
    lineQty,
  } = useMemo(() => {
    let prendas = 0;
    let sub = 0;
    const qty: number[] = [];
    const totales: number[] = [];

    items.forEach((it, i) => {
      const q =
        (parseInt(it.talles.S || "0") || 0) +
        (parseInt(it.talles.M || "0") || 0) +
        (parseInt(it.talles.L || "0") || 0) +
        (parseInt(it.talles.XL || "0") || 0) +
        (parseInt(it.talles.XXL || "0") || 0) +
        (parseInt(it.talles.XXXL || "0") || 0);

      const precio = parseFloat(it.aPagar || "0") || 0;
      const t = precio * q;

      prendas += q;
      sub += t;

      qty[i] = q;
      totales[i] = t;
    });

    const descMonto = (sub * descuento) / 100;
    const envioNum = parseFloat(costoEnvio || "0") || 0;
    const tot = sub - descMonto + envioNum;

    return {
      totalPrendas: prendas,
      subtotal: sub,
      descuentoMonto: descMonto,
      envioMonto: envioNum,
      total: tot,
      lineTotals: totales,
      lineQty: qty,
    };
  }, [items, descuento, costoEnvio]);

  // ------- PDF -------
  const handleDownloadPDF = async () => {
    const el = document.getElementById("sheet");
    if (!el) return;

    try {
      const [jsPDFmod, html2canvasMod] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const jsPDF = (jsPDFmod as any).jsPDF ?? (jsPDFmod as any).default;
      const html2canvas =
        (html2canvasMod as any).default ?? (html2canvasMod as any);

      const canvas = await html2canvas(el, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");

      const pageWidth = 210;
      const imgProps = pdf.getImageProperties(imgData);
      const pdfHeight = (imgProps.height * pageWidth) / imgProps.width;

      pdf.addImage(imgData, "PNG", 0, 0, pageWidth, pdfHeight);
      pdf.save(`Remito-${cliente || "8CHOQ"}.pdf`);
    } catch (err) {
      console.error("Error generando PDF:", err);
    }
  };

  return (
    <main className="flex justify-center">
      {/* hoja con borde grueso tipo planilla (ancho fijo para que entre todo) */}
      <div
        id="sheet"
        className="mx-auto my-6 w-[1120px] max-w-full rounded-[6px] border-4 border-gray-800 bg-white p-5 print:w-[1120px]"
      >
        {/* Cabecera estilo planilla con bordes gruesos en cada bloque */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-5 grid grid-cols-12 gap-2">
            <div className="col-span-12">
              <div className="border-2 border-gray-800 px-3 py-1 text-sm font-bold">
                NOMBRE
              </div>
              <input
                className="h-10 w-full border-x-2 border-b-2 border-gray-800 px-3 outline-none"
                placeholder="Cliente"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
              />
            </div>

            <div className="col-span-12 grid grid-cols-12 gap-2">
              <div className="col-span-6">
                <div className="border-2 border-gray-800 px-3 py-1 text-sm font-bold">
                  FECHA
                </div>
                <input
                  type="date"
                  className="h-10 w-full border-x-2 border-b-2 border-gray-800 px-3 outline-none"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>
              <div className="col-span-6">
                <div className="border-2 border-gray-800 px-3 py-1 text-sm font-bold">
                  DNI
                </div>
                <input
                  className="h-10 w-full border-x-2 border-b-2 border-gray-800 px-3 outline-none"
                  placeholder="DNI"
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="col-span-7 grid grid-cols-12 gap-2">
            <div className="col-span-12">
              <div className="border-2 border-gray-800 px-3 py-1 text-sm font-bold">
                ENVÍO
              </div>
              <select
                className="h-10 w-full border-x-2 border-b-2 border-gray-800 px-3 outline-none"
                value={envio}
                onChange={(e) => setEnvio(e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {envios.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-12">
              <div className="border-2 border-gray-800 px-3 py-1 text-sm font-bold">
                MÉTODO DE PAGO
              </div>
              <select
                className="h-10 w-full border-x-2 border-b-2 border-gray-800 px-3 outline-none"
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {metodosPago.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-9">
              <div className="border-2 border-gray-800 px-3 py-1 text-sm font-bold">
                PROVINCIA / LOCALIDAD
              </div>
              <input
                className="h-10 w-full border-x-2 border-b-2 border-gray-800 px-3 outline-none"
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
              />
            </div>

            <div className="col-span-3">
              <div className="border-2 border-gray-800 px-3 py-1 text-sm font-bold">
                COSTO DE ENVÍO ($)
              </div>
              <input
                className="h-10 w-full border-x-2 border-b-2 border-gray-800 px-3 text-right outline-none"
                value={costoEnvio}
                onChange={(e) => setCostoEnvio(e.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
            </div>
          </div>
        </div>

        {/* Vendedor + Descuento */}
        <div className="mt-3 grid grid-cols-12 gap-3">
          <div className="col-span-6">
            <div className="border-2 border-gray-800 px-3 py-1 text-sm font-bold">
              VENDEDOR
            </div>
            <select
              className="h-10 w-full border-x-2 border-b-2 border-gray-800 px-3 outline-none"
              value={vendedor}
              onChange={(e) => setVendedor(e.target.value)}
            >
              <option value="">Seleccionar...</option>
              {vendedores.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-6">
            <div className="border-2 border-gray-800 px-3 py-1 text-sm font-bold">
              DESCUENTO
            </div>
            <select
              className="h-10 w-full border-x-2 border-b-2 border-gray-800 px-3 outline-none"
              value={descuento}
              onChange={(e) => setDescuento(parseInt(e.target.value))}
            >
              {descuentos.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabla de items (bordes tipo planilla) */}
        <div className="mt-4 rounded-[6px] border-2 border-gray-800 p-2">
          {/* Encabezado de columnas con borde inferior grueso */}
          <div className="grid grid-cols-[120px_280px_110px_repeat(6,65px)_100px_120px] items-center border-b-2 border-gray-800 pb-2 text-sm font-bold">
            <div className="px-2">CÓDIGO</div>
            <div className="px-2">ARTÍCULO</div>
            <div className="px-2">A PAGAR</div>
            <div className="px-2 text-center">S</div>
            <div className="px-2 text-center">M</div>
            <div className="px-2 text-center">L</div>
            <div className="px-2 text-center">XL</div>
            <div className="px-2 text-center">XXL</div>
            <div className="px-2 text-center">XXXL</div>
            <div className="px-2 text-center">CANTIDAD</div>
            <div className="px-2 text-right">TOTAL</div>
          </div>

          {/* Filas */}
          <div className="divide-y divide-gray-300">
            {items.map((it, i) => {
              const cantidad = lineQty[i] ?? 0;
              const totalLinea = lineTotals[i] ?? 0;

              return (
                <div
                  key={i}
                  className="grid grid-cols-[120px_280px_110px_repeat(6,65px)_100px_120px] items-center py-1"
                >
                  {/* Código */}
                  <div className="px-2">
                    <input
                      className="h-9 w-[116px] rounded-sm border border-gray-400 px-2 outline-none"
                      placeholder="Código"
                      value={it.codigo}
                      onChange={(e) => updateItem(i, "codigo", e.target.value)}
                    />
                  </div>

                  {/* Artículo */}
                  <div className="px-2">
                    <input
                      className="h-9 w-[272px] rounded-sm border border-gray-400 px-2 outline-none"
                      placeholder="Artículo"
                      value={it.articulo}
                      onChange={(e) => updateItem(i, "articulo", e.target.value)}
                    />
                  </div>

                  {/* A pagar */}
                  <div className="px-2">
                    <input
                      className="h-9 w-[106px] rounded-sm border border-gray-400 px-2 text-right outline-none"
                      placeholder="0"
                      value={it.aPagar}
                      onChange={(e) => updateItem(i, "aPagar", e.target.value)}
                      inputMode="decimal"
                    />
                  </div>

                  {/* Talles */}
                  {(["S", "M", "L", "XL", "XXL", "XXXL"] as const).map((t) => (
                    <div key={t} className="px-2 text-center">
                      <input
                        className="h-9 w-[56px] rounded-sm border border-gray-400 text-center outline-none"
                        placeholder="0"
                        value={it.talles[t]}
                        onChange={(e) => updateTalle(i, t, e.target.value)}
                        inputMode="numeric"
                      />
                    </div>
                  ))}

                  {/* Cantidad */}
                  <div className="px-2 text-center">{cantidad}</div>

                  {/* Total */}
                  <div className="px-2 text-right">${totalLinea.toFixed(2)}</div>
                </div>
              );
            })}
          </div>

          {/* Línea gruesa antes del total prendas */}
          <div className="mt-2 border-t-2 border-gray-800 pt-2 text-center text-sm font-bold">
            TOTAL PRENDAS
          </div>
          <div className="text-center text-base">{totalPrendas}</div>
        </div>

        {/* Totales a la derecha con borde grueso exterior */}
        <div className="mt-4 grid grid-cols-12 gap-3">
          <div className="col-span-6 flex items-center gap-3">
            <button
              onClick={addRow}
              className="rounded-md border-2 border-gray-800 px-4 py-2 text-sm hover:bg-gray-50"
            >
              + Agregar fila
            </button>
            <button
              onClick={clearTable}
              className="rounded-md border-2 border-gray-800 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Limpiar
            </button>
          </div>

          <div className="col-span-6">
            <div className="ml-auto w-[360px] rounded-[6px] border-4 border-gray-800">
              <div className="grid grid-cols-2 gap-y-0 p-3 text-[15px]">
                <div className="border-b border-gray-300 py-2 font-semibold text-gray-700">
                  SUBTOTAL
                </div>
                <div className="border-b border-gray-300 py-2 text-right font-semibold">
                  ${subtotal.toFixed(2)}
                </div>

                <div className="border-b border-gray-300 py-2 font-semibold text-gray-700">
                  DESCUENTO {descuento ? `(${descuento}%)` : ""}
                </div>
                <div className="border-b border-gray-300 py-2 text-right font-semibold">
                  -${descuentoMonto.toFixed(2)}
                </div>

                <div className="border-b border-gray-300 py-2 font-semibold text-gray-700">
                  ENVÍO
                </div>
                <div className="border-b border-gray-300 py-2 text-right font-semibold">
                  ${envioMonto.toFixed(2)}
                </div>

                <div className="col-span-2 mt-2 border-t-2 border-gray-800 pt-2 text-xl font-extrabold">
                  <div className="flex items-center justify-between">
                    <span>TOTAL</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={handleDownloadPDF}
            className="rounded-md border-2 border-gray-800 px-4 py-2 hover:bg-gray-50"
          >
            Descargar PDF
          </button>
        </div>
      </div>
    </main>
  );
}
