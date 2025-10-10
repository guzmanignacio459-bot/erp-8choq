"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

/* ======================= Tipos ======================= */

type Item = {
  codigo: string;
  articulo: string;
  aPagar: number;
  talles: { [key: string]: number }; // S, M, L, XL, XXL, XXXL
  cantidad: number;
  total: number;
  notas: string;
};

/* =============== Util: fecha ISO para <input type="date"> =============== */
const toISODate = (d: Date) =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);

/* ======================= Componente ======================= */

export default function Page() {
  /* ---------- Estado header ---------- */
  const [cliente, setCliente] = useState<string>("");
  const [fecha, setFecha] = useState<string>(toISODate(new Date()));
  const [dni, setDni] = useState<string>("");
  const [vendedor, setVendedor] = useState<string>("");
  const [envio, setEnvio] = useState<string>("");
  const [metodoPago, setMetodoPago] = useState<string>("");
  const [provincia, setProvincia] = useState<string>("Mendoza");
  const [costoEnvio, setCostoEnvio] = useState<number>(0);
  const [descuento, setDescuento] = useState<number>(0);

  /* ---------- Catálogos ---------- */
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

  /* ---------- Items ---------- */
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

  /* ---------- Handlers de tabla ---------- */
  const handleItemField =
    (idx: number, field: keyof Item) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val =
        field === "aPagar" ? Number(e.target.value || 0) : e.target.value;
      setItems((prev) => {
        const clone = [...prev];
        const row = { ...clone[idx] };
        (row as any)[field] = val;
        // recalcular
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
        // recalcular
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

  /* ---------- Totales ---------- */
  const totals = useMemo(() => {
    const totalPrendas = items.reduce((a, i) => a + (i.cantidad || 0), 0);
    const subtotal = items.reduce((a, i) => a + (i.total || 0), 0);
    const montoDesc = (subtotal * (descuento || 0)) / 100;
    const total = subtotal - montoDesc + (costoEnvio || 0);
    return { totalPrendas, subtotal, montoDesc, total };
  }, [items, descuento, costoEnvio]);

  /* ---------- PDF ---------- */
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

    // capturamos el contenedor a escala 2 para mejor nitidez
    const canvas = await html2canvas(el, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = 210; // A4 ancho
    const imgProps = pdf.getImageProperties(imgData);
    const pdfHeight = (imgProps.height * pageWidth) / imgProps.width;

    pdf.addImage(imgData, "PNG", 0, 0, pageWidth, pdfHeight);
    pdf.save(`Remito-${cliente || "8CHOQ"}.pdf`);
  };

  /* ======================= Estilos inline ======================= */

  // contenedor A4
  const page: React.CSSProperties = {
    maxWidth: 1100,
    margin: "20px auto",
    padding: "12mm",
    background: "#fff",
    color: "#000",
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,.08)",
  };

  const headerRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    gap: 16,
    marginBottom: 12,
  };

  const h1: React.CSSProperties = {
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
  };

  const card: React.CSSProperties = {
    border: "1px solid #e6e6e6",
    borderRadius: 12,
    padding: 16,
    background: "#fafafa",
    marginBottom: 14,
  };

  const twoCol: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
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

  const inputCode: React.CSSProperties = {
    ...input,
    width: 140,
    minWidth: 140,
  };

  const inputArticulo: React.CSSProperties = {
    ...input,
    width: 260,
    minWidth: 260,
  };

  const smallInputRight: React.CSSProperties = {
    ...input,
    textAlign: "right" as const,
  };

  const tableWrap: React.CSSProperties = {
    overflowX: "auto",
    border: "1px solid #eaeaea",
    borderRadius: 12,
    background: "#fff",
  };

  const table: React.CSSProperties = {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
  };

  const th: React.CSSProperties = {
    padding: "10px 12px",
    background: "#f5f5f5",
    borderBottom: "1px solid #eaeaea",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "left" as const,
    position: "sticky",
    top: 0,
    zIndex: 1,
  };

  const td: React.CSSProperties = {
    padding: 8,
    borderBottom: "1px solid #f0f0f0",
    background: "#fff",
    verticalAlign: "middle",
  };

  const footer: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
  };

  const totalsBox: React.CSSProperties = {
    border: "1px solid #e6e6e6",
    borderRadius: 12,
    padding: 12,
    textAlign: "right" as const,
    background: "#fafafa",
    minWidth: 260,
    fontSize: 14,
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

  /* ======================= Render ======================= */

  return (
    <div id="remito-container" style={page}>
      {/* HEADER */}
      <div style={headerRow}>
        <div>
          <Image
            src="/logo-8choq.png"
            alt="8CHOQ"
            width={80}
            height={40}
            priority
            style={{ objectFit: "contain" }}
          />
        </div>
        <div>
          <h1 style={h1}>Sistema de Remitos 8CHOQ (Prototipo)</h1>
        </div>
      </div>

      {/* FORM */}
      <div style={card}>
        <div style={twoCol}>
          {/* Columna izquierda */}
          <div>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>Nombre</label>
              <input
                style={input}
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Cliente"
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={label}>DNI</label>
              <input
                style={input}
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                placeholder="DNI"
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={label}>Vendedor</label>
              <select
                style={input}
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

            <div style={{ marginBottom: 0 }}>
              <label style={label}>Descuento</label>
              <select
                style={input}
                value={descuento}
                onChange={(e) => setDescuento(Number(e.target.value))}
              >
                {descuentos.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Columna derecha */}
          <div>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>Fecha</label>
              <input
                style={input}
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={label}>Envío</label>
              <select
                style={input}
                value={envio}
                onChange={(e) => setEnvio(e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {envios.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={label}>Método de Pago</label>
              <select
                style={input}
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {metodosPago.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 10 }}>
              <div>
                <label style={label}>Provincia / Localidad</label>
                <input
                  style={input}
                  value={provincia}
                  onChange={(e) => setProvincia(e.target.value)}
                  placeholder="Provincia / Localidad"
                />
              </div>
              <div>
                <label style={label}>Costo de Envío ($)</label>
                <input
                  style={smallInputRight}
                  type="number"
                  value={costoEnvio}
                  onChange={(e) => setCostoEnvio(Number(e.target.value || 0))}
                  min={0}
                />
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
              <tr key={idx}>
                <td style={td}>
                  <input
                    style={inputCode}
                    value={it.codigo}
                    onChange={handleItemField(idx, "codigo")}
                    placeholder="Código"
                  />
                </td>
                <td style={td}>
                  <input
                    style={inputArticulo}
                    value={it.articulo}
                    onChange={handleItemField(idx, "articulo")}
                    placeholder="Artículo"
                  />
                </td>
                <td style={td}>
                  <input
                    style={{ ...smallInputRight, width: 100 }}
                    type="number"
                    min={0}
                    value={it.aPagar}
                    onChange={handleItemField(idx, "aPagar")}
                  />
                </td>
                {(["S", "M", "L", "XL", "XXL", "XXXL"] as const).map((talle) => (
                  <td key={talle} style={td}>
                    <input
                      style={{ ...smallInputRight, width: 70 }}
                      type="number"
                      min={0}
                      value={it.talles[talle]}
                      onChange={handleTalle(idx, talle)}
                    />
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
      <div style={footer}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={clearTable}
            style={{ ...button, background: "#eee", color: "#222" }}
          >
            Limpiar
          </button>
          <button type="button" onClick={addRow} style={{ ...button, background: "#0ea5e9" }}>
            + Agregar fila
          </button>
          <button type="button" onClick={handleDownloadPDF} style={button}>
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
  );
}
