"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

type Item = {
  codigo: string;
  articulo: string;
  aPagar: number;
  talles: { [key: string]: number };
  cantidad: number;
  total: number;
  notas: string;
};

const toISODate = (d: Date) =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);

export default function Page() {
  const [cliente, setCliente] = useState("");
  const [fecha, setFecha] = useState(toISODate(new Date()));
  const [dni, setDni] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [envio, setEnvio] = useState("");
  const [metodoPago, setMetodoPago] = useState("");
  const [provincia, setProvincia] = useState("Mendoza");
  const [costoEnvio, setCostoEnvio] = useState(0);
  const [descuento, setDescuento] = useState(0);

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
    "Debito",
    "QR",
  ];
  const descuentos = [
    { label: "Sin descuento", value: 0 },
    { label: "Mayorista 5%", value: 5 },
    { label: "Minorista 10%", value: 10 },
  ];

  const emptyItem = (): Item => ({
    codigo: "",
    articulo: "",
    aPagar: 0,
    talles: { S: 0, M: 0, L: 0, XL: 0, XXL: 0, XXXL: 0 },
    cantidad: 0,
    total: 0,
    notas: "",
  });

  const [items, setItems] = useState<Item[]>(
    Array.from({ length: 12 }, () => emptyItem())
  );

  const addRow = () => setItems((p) => [...p, emptyItem()]);
  const clearTable = () =>
    setItems(Array.from({ length: 12 }, () => emptyItem()));

  const handleItemField =
    (idx: number, field: keyof Item) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val =
        field === "aPagar" ? Number(e.target.value || 0) : e.target.value;
      setItems((prev) => {
        const clone = [...prev];
        const row = { ...clone[idx] };
        (row as any)[field] = val;
        const cant =
          row.talles.S +
          row.talles.M +
          row.talles.L +
          row.talles.XL +
          row.talles.XXL +
          row.talles.XXXL;
        row.cantidad = cant;
        row.total = cant * (row.aPagar || 0);
        clone[idx] = row;
        return clone;
      });
    };

  const handleTalle =
    (idx: number, talle: keyof Item["talles"]) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value || 0);
      setItems((prev) => {
        const clone = [...prev];
        const row = { ...clone[idx], talles: { ...clone[idx].talles } };
        row.talles[talle] = val;
        const cant =
          row.talles.S +
          row.talles.M +
          row.talles.L +
          row.talles.XL +
          row.talles.XXL +
          row.talles.XXXL;
        row.cantidad = cant;
        row.total = cant * (row.aPagar || 0);
        clone[idx] = row;
        return clone;
      });
    };

  const totals = useMemo(() => {
    const totalPrendas = items.reduce((a, i) => a + (i.cantidad || 0), 0);
    const subtotal = items.reduce((a, i) => a + (i.total || 0), 0);
    const montoDesc = (subtotal * (descuento || 0)) / 100;
    const total = subtotal - montoDesc + (costoEnvio || 0);
    return { totalPrendas, subtotal, montoDesc, total };
  }, [items, descuento, costoEnvio]);

  const handleDownloadPDF = async () => {
    const el = document.getElementById("remito-container");
    if (!el) return;

    const [jspdfMod, html2canvasMod] = await Promise.all([
      import("jspdf"),
      import("html2canvas"),
    ]);

    const jsPDF = (jspdfMod as any).jsPDF ?? (jspdfMod as any).default;
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
  };

  /* ======================= Estilos ======================= */

  const page: React.CSSProperties = {
    width: "190mm",          // ancho interno pensado para A4
    margin: "10mm auto",
    padding: "10mm",
    background: "#fff",
    color: "#000",
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,.08)",
  };

  const headerRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 8,
    marginBottom: 10,
  };

  const h1: React.CSSProperties = {
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
    textAlign: "center",
  };

  const card: React.CSSProperties = {
    border: "1px solid #e6e6e6",
    borderRadius: 12,
    padding: 12,
    background: "#fafafa",
    marginBottom: 12,
    pageBreakInside: "avoid",
  };

  const twoCol: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  };

  const label: React.CSSProperties = {
    fontSize: 12,
    color: "#555",
    display: "block",
    marginBottom: 6,
  };

  const input: React.CSSProperties = {
    width: "100%",
    border: "1px solid #dcdcdc",
    borderRadius: 8,
    padding: "10px 12px",
    outline: "none",
    fontSize: 14,
  };

  const inputCode: React.CSSProperties = { ...input, width: 140, minWidth: 140 };
  const inputArticulo: React.CSSProperties = { ...input, width: 260, minWidth: 260 };
  const smallInputRight: React.CSSProperties = { ...input, textAlign: "right" as const };

  const tableWrap: React.CSSProperties = {
    overflowX: "auto",
    border: "1px solid #eaeaea",
    borderRadius: 12,
    background: "#fff",
  };

  const table: React.CSSProperties = { width: "100%", borderCollapse: "separate", borderSpacing: 0 };
  const th: React.CSSProperties = {
    padding: "8px 10px",
    background: "#f5f5f5",
    borderBottom: "1px solid #eaeaea",
    fontSize: 12,
    fontWeight: 600,
    textAlign: "left" as const,
  };
  const td: React.CSSProperties = {
    padding: 8,
    borderBottom: "1px solid #f0f0f0",
    background: "#fff",
    verticalAlign: "middle",
    pageBreakInside: "avoid",
  };

  const footer: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  };

  const totalsBox: React.CSSProperties = {
    border: "1px solid #e6e6e6",
    borderRadius: 12,
    padding: 10,
    textAlign: "right" as const,
    background: "#fafafa",
    minWidth: 240,
    fontSize: 14,
    pageBreakInside: "avoid",
  };

  const button: React.CSSProperties = {
    background: "#22c55e",
    color: "#fff",
    border: 0,
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    cursor: "pointer",
  };

  return (
    <>
      {/* Reglas específicas de impresión */}
      <style>{`
        @page {
          size: A4;
          margin: 8mm;
        }
        @media print {
          html, body { 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact;
            background: #fff;
          }
          #remito-container {
            width: 190mm !important;
            margin: 0 auto !important;
            padding: 8mm !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          table thead th {
            position: static !important; /* quitar sticky si el navegador lo aplica */
          }
          .no-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-small {
            font-size: 12px !important;
          }
          .print-hide {
            display: none !important;
          }
        }
      `}</style>

      <div id="remito-container" style={page} className="no-break print-small">
        {/* HEADER */}
        <div style={headerRow}>
          <h1 style={h1}>Sistema de Remitos 8CHOQ (Prototipo)</h1>
        </div>

        {/* FORM */}
        <div style={card} className="no-break">
          <div style={twoCol}>
            <div>
              <div style={{ marginBottom: 8 }}>
                <label style={label}>Nombre</label>
                <input style={input} value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Cliente" />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={label}>DNI</label>
                <input style={input} value={dni} onChange={(e) => setDni(e.target.value)} placeholder="DNI" />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={label}>Vendedor</label>
                <select style={input} value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 0 }}>
                <label style={label}>Descuento</label>
                <select style={input} value={descuento} onChange={(e) => setDescuento(Number(e.target.value))}>
                  {descuentos.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <div style={{ marginBottom: 8 }}>
                <label style={label}>Fecha</label>
                <input style={input} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={label}>Envío</label>
                <select style={input} value={envio} onChange={(e) => setEnvio(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {envios.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={label}>Método de Pago</label>
                <select style={input} value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {metodosPago.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 8 }}>
                <div>
                  <label style={label}>Provincia / Localidad</label>
                  <input style={input} value={provincia} onChange={(e) => setProvincia(e.target.value)} placeholder="Provincia / Localidad" />
                </div>
                <div>
                  <label style={label}>Costo de Envío ($)</label>
                  <input style={smallInputRight} type="number" value={costoEnvio}
                         onChange={(e) => setCostoEnvio(Number(e.target.value || 0))} min={0}/>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* TABLA */}
        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={{ ...th, minWidth: 140 }}>Código</th>
                <th style={{ ...th, minWidth: 260 }}>Artículo</th>
                <th style={{ ...th, textAlign: "right" }}>A Pagar</th>
                <th style={{ ...th, textAlign: "right" }}>S</th>
                <th style={{ ...th, textAlign: "right" }}>M</th>
                <th style={{ ...th, textAlign: "right" }}>L</th>
                <th style={{ ...th, textAlign: "right" }}>XL</th>
                <th style={{ ...th, textAlign: "right" }}>XXL</th>
                <th style={{ ...th, textAlign: "right" }}>XXXL</th>
                <th style={{ ...th, textAlign: "right" }}>Cantidad</th>
                <th style={{ ...th, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="no-break">
                  <td style={td}>
                    <input style={inputCode} value={it.codigo} onChange={handleItemField(idx, "codigo")} placeholder="Código" />
                  </td>
                  <td style={td}>
                    <input style={inputArticulo} value={it.articulo} onChange={handleItemField(idx, "articulo")} placeholder="Artículo" />
                  </td>
                  <td style={td}>
                    <input style={{ ...smallInputRight, width: 90 }} type="number" min={0} value={it.aPagar}
                           onChange={handleItemField(idx, "aPagar")} />
                  </td>
                  {(["S","M","L","XL","XXL","XXXL"] as const).map((talle) => (
                    <td key={talle} style={td}>
                      <input style={{ ...smallInputRight, width: 65 }} type="number" min={0}
                             value={it.talles[talle]} onChange={handleTalle(idx, talle)} />
                    </td>
                  ))}
                  <td style={{ ...td, textAlign: "right" }}>{it.cantidad || 0}</td>
                  <td style={{ ...td, textAlign: "right" }}>${(it.total || 0).toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* FOOTER */}
        <div style={footer} className="no-break">
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={clearTable} style={{ ...button, background: "#eee", color: "#222" }} className="print-hide">
              Limpiar
            </button>
            <button type="button" onClick={addRow} style={{ ...button, background: "#0ea5e9" }} className="print-hide">
              + Agregar fila
            </button>
            <button type="button" onClick={handleDownloadPDF} style={button} className="print-hide">
              Descargar PDF
            </button>
          </div>

          <div style={totalsBox}>
            <div>Total Prendas: {totals.totalPrendas}</div>
            <div>Subtotal: ${totals.subtotal.toFixed(0)}</div>
            <div>Descuento: -${totals.montoDesc.toFixed(0)}</div>
            <div>Envío: ${Number(costoEnvio || 0).toFixed(0)}</div>
            <div style={{ fontWeight: 700 }}>Total: ${totals.total.toFixed(0)}</div>
          </div>
        </div>
      </div>
    </>
  );
}
