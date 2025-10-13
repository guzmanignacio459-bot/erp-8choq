"use client";

import { useMemo, useState } from "react";

type Talles = { S: string; M: string; L: string; XL: string; XXL: string; XXXL: string };
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

export default function Page() {
  // encabezado
  const [cliente, setCliente] = useState("");
  const [fecha, setFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  const [dni, setDni] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [envio, setEnvio] = useState("");
  const [metodoPago, setMetodoPago] = useState("");
  const [provincia, setProvincia] = useState("Mendoza");
  const [costoEnvio, setCostoEnvio] = useState("0");
  const [descuento, setDescuento] = useState(0);

  // filas
  const [items, setItems] = useState<Item[]>(Array.from({ length: DEFAULT_ROWS }, emptyItem));

  const vendedores = ["Nacho", "Santi", "Paula", "Malena"];
  const envios = ["Correo - Sucursal", "Correo - Domicilio", "Andreani - Sucursal", "Andreani - Domicilio", "OCA", "Send Box", "Retira", "Domicilio"];
  const metodosPago = ["MP 1 cuota", "MP 3 cuotas", "Transferencia 1", "Transferencia 2", "Efectivo", "Débito", "QR"];
  const descuentos = [
    { label: "Sin descuento", value: 0 },
    { label: "Mayorista 5%", value: 5 },
    { label: "Promo 10%", value: 10 },
    { label: "Mayorista 15%", value: 15 },
    { label: "Promo 20%", value: 20 },
  ];

  const updateItem = (i: number, key: keyof Item, value: string) =>
    setItems(prev => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  const updateTalle = (i: number, talla: keyof Talles, value: string) =>
    setItems(prev => prev.map((r, idx) => (idx === i ? { ...r, talles: { ...r.talles, [talla]: value } } : r)));

  const addRow = () => setItems(prev => [...prev, emptyItem()]);

  // totales
  const { lineQty, lineTotal, totalPrendas, subtotal, descuentoMonto, envioMonto, total } = useMemo(() => {
    const qty: number[] = [];
    const tot: number[] = [];
    let prendas = 0;
    let sub = 0;

    items.forEach((it, i) => {
      const q =
        (parseInt(it.talles.S || "0") || 0) +
        (parseInt(it.talles.M || "0") || 0) +
        (parseInt(it.talles.L || "0") || 0) +
        (parseInt(it.talles.XL || "0") || 0) +
        (parseInt(it.talles.XXL || "0") || 0) +
        (parseInt(it.talles.XXXL || "0") || 0);

      const p = parseFloat(it.aPagar || "0") || 0;
      const t = q * p;

      qty[i] = q;
      tot[i] = t;

      prendas += q;
      sub += t;
    });

    const desc = (sub * descuento) / 100;
    const env = parseFloat(costoEnvio || "0") || 0;
    const totGeneral = sub - desc + env;

    return { lineQty: qty, lineTotal: tot, totalPrendas: prendas, subtotal: sub, descuentoMonto: desc, envioMonto: env, total: totGeneral };
  }, [items, descuento, costoEnvio]);

  const handlePDF = async () => {
    const node = document.getElementById("sheet");
    if (!node) return;
    const [jspdfMod, html2canvasMod] = await Promise.all([import("jspdf"), import("html2canvas")]);
    const jsPDF = (jspdfMod as any).jsPDF ?? (jspdfMod as any).default;
    const html2canvas = (html2canvasMod as any).default ?? (html2canvasMod as any);

    const canvas = await html2canvas(node, { scale: 2 });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageW = 210;
    const props = pdf.getImageProperties(img);
    const h = (props.height * pageW) / props.width;
    pdf.addImage(img, "PNG", 0, 0, pageW, h);
    pdf.save(`Remito-${cliente || "8CHOQ"}.pdf`);
  };

  return (
    <main className="page">
      <div id="sheet" className="sheet">
        {/* LOGO */}
        <table className="full">
          <colgroup>
            <col style={{ width: "200px" }} />
            <col />
          </colgroup>
          <tbody>
            <tr>
              <td className="cell thick all-center" style={{ height: 76 }}>
                <div className="logo">8CHOQ</div>
              </td>
              <td className="cell thick"></td>
            </tr>
          </tbody>
        </table>

        {/* CABECERA */}
        <table className="full mt8">
          <colgroup>
            <col style={{ width: "170px" }} />
            <col style={{ width: "370px" }} />
            <col style={{ width: "170px" }} />
            <col style={{ width: "370px" }} />
          </colgroup>
          <tbody>
            <tr>
              <td className="cell thick header">NOMBRE</td>
              <td className="cell thick">
                <input className="in" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Cliente" />
              </td>
              <td className="cell thick header">ENVÍO</td>
              <td className="cell thick">
                <select className="in" value={envio} onChange={e => setEnvio(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {envios.map(v => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </td>
            </tr>

            <tr>
              <td className="cell thick header">FECHA</td>
              <td className="cell thick">
                <input type="date" className="in" value={fecha} onChange={e => setFecha(e.target.value)} />
              </td>
              <td className="cell thick header">MÉTODO DE PAGO</td>
              <td className="cell thick">
                <select className="in" value={metodoPago} onChange={e => setMetodoPago(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {metodosPago.map(v => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </td>
            </tr>

            <tr>
              <td className="cell thick header">DNI</td>
              <td className="cell thick">
                <input className="in" value={dni} onChange={e => setDni(e.target.value)} placeholder="DNI" />
              </td>
              <td className="cell thick header">PROVINCIA / LOCALIDAD</td>
              <td className="cell thick">
                <input className="in" value={provincia} onChange={e => setProvincia(e.target.value)} />
              </td>
            </tr>

            <tr>
              <td className="cell thick header">VENDEDOR</td>
              <td className="cell thick">
                <select className="in" value={vendedor} onChange={e => setVendedor(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {vendedores.map(v => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </td>
              <td className="cell thick header">COSTO DE ENVÍO ($)</td>
              <td className="cell thick">
                <input className="in right" value={costoEnvio} onChange={e => setCostoEnvio(e.target.value)} inputMode="decimal" />
              </td>
            </tr>

            <tr>
              <td className="cell thick header">DESCUENTO</td>
              <td className="cell thick">
                <select className="in" value={descuento} onChange={e => setDescuento(parseInt(e.target.value))}>
                  {descuentos.map(d => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="cell thick" />
              <td className="cell thick" />
            </tr>
          </tbody>
        </table>

        {/* CUERPO (medidas fijas para replicar la planilla) */}
        <table className="full mt10">
          <colgroup>
            <col style={{ width: "120px" }} />   {/* CODIGO */}
            <col style={{ width: "280px" }} />   {/* ARTICULO */}
            <col style={{ width: "110px" }} />   {/* A PAGAR */}
            <col style={{ width: "60px" }} />    {/* S */}
            <col style={{ width: "60px" }} />    {/* M */}
            <col style={{ width: "60px" }} />    {/* L */}
            <col style={{ width: "60px" }} />    {/* XL */}
            <col style={{ width: "60px" }} />    {/* XXL */}
            <col style={{ width: "60px" }} />    {/* XXXL */}
            <col style={{ width: "100px" }} />   {/* CANT */}
            <col style={{ width: "120px" }} />   {/* TOTAL */}
          </colgroup>
          <thead>
            <tr>
              <th className="cell thick headtxt left">CÓDIGO</th>
              <th className="cell thick headtxt left">ARTÍCULO</th>
              <th className="cell thick headtxt left">A PAGAR</th>
              <th className="cell thick headtxt">S</th>
              <th className="cell thick headtxt">M</th>
              <th className="cell thick headtxt">L</th>
              <th className="cell thick headtxt">XL</th>
              <th className="cell thick headtxt">XXL</th>
              <th className="cell thick headtxt">XXXL</th>
              <th className="cell thick headtxt">CANTIDAD</th>
              <th className="cell thick headtxt right">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="cell thin">
                  <input className="in" placeholder="Código" value={it.codigo} onChange={e => updateItem(i, "codigo", e.target.value)} />
                </td>
                <td className="cell thin">
                  <input className="in" placeholder="Artículo" value={it.articulo} onChange={e => updateItem(i, "articulo", e.target.value)} />
                </td>
                <td className="cell thin">
                  <input className="in right" placeholder="0" value={it.aPagar} onChange={e => updateItem(i, "aPagar", e.target.value)} inputMode="decimal" />
                </td>
                {(["S", "M", "L", "XL", "XXL", "XXXL"] as const).map(t => (
                  <td key={t} className="cell thin center">
                    <input className="in center" value={it.talles[t]} onChange={e => updateTalle(i, t, e.target.value)} inputMode="numeric" />
                  </td>
                ))}
                <td className="cell thin center">{lineQty[i] ?? 0}</td>
                <td className="cell thin right">${(lineTotal[i] ?? 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="cell thick" colSpan={9} />
              <td className="cell thick headtxt center">TOTAL PRENDAS</td>
              <td className="cell thick right">{totalPrendas}</td>
            </tr>
            <tr>
              <td className="cell thick" colSpan={9} />
              <td className="cell thin headtxt right">SUBTOTAL</td>
              <td className="cell thin right">${subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td className="cell thick" colSpan={9} />
              <td className="cell thin headtxt right">DESCUENTO {descuento ? `(${descuento}%)` : ""}</td>
              <td className="cell thin right">-${descuentoMonto.toFixed(2)}</td>
            </tr>
            <tr>
              <td className="cell thick" colSpan={9} />
              <td className="cell thin headtxt right">ENVÍO</td>
              <td className="cell thin right">${envioMonto.toFixed(2)}</td>
            </tr>
            <tr>
              <td className="cell thick" colSpan={9} />
              <td className="cell thick headtxt right">TOTAL</td>
              <td className="cell thick right">${total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        {/* botones */}
        <div className="btns">
          <button className="btn" onClick={addRow}>+ Agregar fila</button>
          <button className="btn" onClick={handlePDF}>Descargar PDF</button>
        </div>
      </div>

      <style jsx>{`
        /* Lienzo tipo A4 en px: ~1120 de ancho para ver todo sin scroll horizontal */
        .page {
          display: flex;
          justify-content: center;
          padding: 24px 8px;
          background: #f4f4f4;
        }
        .sheet {
          width: 1120px;
          background: #fff;
          border: 4px solid #1f2937; /* grueso */
          border-radius: 6px;
          padding: 12px;
        }
        .full { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .mt8 { margin-top: 8px; }
        .mt10 { margin-top: 10px; }

        .cell { padding: 6px 8px; vertical-align: middle; }
        .thick { border: 2px solid #1f2937; }       /* marco/encabezados grueso */
        .thin  { border: 1px solid #9ca3af; }       /* celdas internas finas */

        .headtxt { font-weight: 700; color: #000; }
        .header { font-weight: 700; font-size: 14px; }
        .left { text-align: left; }
        .right { text-align: right; }
        .center { text-align: center; }
        .all-center { display: flex; align-items: center; justify-content: center; }

        .logo { font-size: 64px; font-weight: 800; letter-spacing: 2px; }

        .in {
          width: 100%;
          height: 34px;
          box-sizing: border-box;
          padding: 4px 8px;
          border: 1px solid #9ca3af;
          border-radius: 3px;
          outline: none;
          background: #fff;
          font-size: 14px;
        }
        .in.right { text-align: right; }
        .in.center { text-align: center; }

        .btns { display: flex; gap: 12px; justify-content: flex-end; margin-top: 12px; }
        .btn {
          padding: 8px 14px;
          border: 2px solid #1f2937;
          background: #fff;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn:hover { background: #f7f7f7; }

        @media print {
          .page { padding: 0; background: transparent; }
          .sheet { width: 1120px; border-width: 2px; }
          .btns { display: none; }
        }
      `}</style>
    </main>
  );
}
