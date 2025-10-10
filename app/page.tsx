"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";

/** ---------- Tipos ---------- */
type Talles = {
  S: number;
  M: number;
  L: number;
  XL: number;
  XXL: number;
  XXXL: number;
};

type Item = {
  codigo: string;
  articulo: string;
  aPagar: number; // precio unitario
  talles: Talles;
};

/** ---------- Helpers ---------- */
const emptyItem = (): Item => ({
  codigo: "",
  articulo: "",
  aPagar: 0,
  talles: { S: 0, M: 0, L: 0, XL: 0, XXL: 0, XXXL: 0 },
});

const A4_WIDTH_MM = 210;

/** ---------- Componente principal ---------- */
export default function Remito8CHOQ() {
  /** Items (12 filas) */
  const [items, setItems] = useState<Item[]>(
    Array.from({ length: 12 }, () => emptyItem())
  );

  /** Encabezado */
  const [cliente, setCliente] = useState<string>("");
  const [fecha, setFecha] = useState<string>(
    new Date().toLocaleDateString("es-AR")
  );
  const [dni, setDni] = useState<string>("");
  const [vendedor, setVendedor] = useState<string>("");
  const [envio, setEnvio] = useState<string>("");
  const [metodoPago, setMetodoPago] = useState<string>("");
  const [provincia, setProvincia] = useState<string>("Mendoza");
  const [costoEnvio, setCostoEnvio] = useState<number>(0);
  const [descuento, setDescuento] = useState<number>(0); // 0 | 5 | 10

  /** Opciones */
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
    "Transferencia 2",
    "MP 3 cuotas",
    "Transferencia 1",
    "Efectivo",
    "Débito",
    "QR",
  ];

  const descuentos = [
    { label: "Sin descuento", value: 0 },
    { label: "Mayorista 5%", value: 5 },
    { label: "Minorista 10%", value: 10 },
  ];

  /** ---------- Cálculos ---------- */
  const {
    totalPrendas,
    subtotal,
    montoDescuento,
    totalConDescuento,
    totalFinal,
  } = useMemo(() => {
    const cantidades = items.map(
      (it) =>
        it.talles.S +
        it.talles.M +
        it.talles.L +
        it.talles.XL +
        it.talles.XXL +
        it.talles.XXXL
    );

    const totalPrendas = cantidades.reduce((a, b) => a + b, 0);

    const subtotal = items.reduce((acc, it, idx) => {
      const cant = cantidades[idx];
      return acc + it.aPagar * cant;
    }, 0);

    const montoDescuento = Math.round((subtotal * descuento) / 100);
    const totalConDescuento = subtotal - montoDescuento;
    const totalFinal = totalConDescuento + (Number.isFinite(costoEnvio) ? costoEnvio : 0);

    return {
      totalPrendas,
      subtotal,
      montoDescuento,
      totalConDescuento,
      totalFinal,
    };
  }, [items, descuento, costoEnvio]);

  /** ---------- Handlers ---------- */
  const handleItemField =
    (index: number, field: keyof Item) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setItems((prev) => {
        const copy = [...prev];
        const value =
          field === "aPagar" ? Number(e.target.value || 0) : e.target.value;
        (copy[index] as any)[field] = value;
        return copy;
      });
    };

  const handleTalle =
    (index: number, size: keyof Talles) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value || 0);
      setItems((prev) => {
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          talles: { ...copy[index].talles, [size]: val },
        };
        return copy;
      });
    };

  const addRow = () => setItems((prev) => [...prev, emptyItem()]);
  const clearTable = () =>
    setItems(Array.from({ length: 12 }, () => emptyItem()));

  /** ---------- PDF (A4) ---------- */
  const handleDownloadPDF = async () => {
    const el = document.getElementById("remito-container");
    if (!el) return;

    // Imports dinámicos (solo en cliente)
    const [{ jsPDF }, html2canvas] = await Promise.all([
      import("jspdf"),
      import("html2canvas").then((m) => m.default),
    ]);

    // Capturamos al ancho A4 virtual
    const canvas = await html2canvas(el, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageWidth = A4_WIDTH_MM;
    const imgProps = pdf.getImageProperties(imgData);
    const pdfHeight = (imgProps.height * pageWidth) / imgProps.width;

    pdf.addImage(imgData, "PNG", 0, 0, pageWidth, pdfHeight);
    pdf.save(`Remito-${cliente || "8CHOQ"}.pdf`);
  };

  /** ---------- Estilos ---------- */
  const container: React.CSSProperties = {
    width: "210mm",
    minHeight: "297mm",
    margin: "0 auto",
    padding: "12mm",
    background: "#fff",
    color: "#000",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
  };

  const card: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 16,
    background: "#fff",
  };

  const grid2: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  };

  const label: React.CSSProperties = {
    fontSize: 12,
    color: "#374151",
    marginBottom: 6,
    display: "block",
  };

  const input: React.CSSProperties = {
    width: "100%",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
    outline: "none",
  };

  const smallInput: React.CSSProperties = {
    width: 56,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "6px 8px",
    fontSize: 13,
    textAlign: "right" as const,
  };

  const th: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 8px",
    borderBottom: "1px solid #e5e7eb",
    textAlign: "left" as const,
    whiteSpace: "nowrap" as const,
  };

  const td: React.CSSProperties = {
    padding: "6px 8px",
    borderBottom: "1px solid #f3f4f6",
  };

  return (
    <div style={{ background: "#f5f7fb", minHeight: "100vh", padding: 16 }}>
      {/* Reglas de impresión: A4 sin márgenes del navegador */}
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          #remito-container { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      <div id="remito-container" style={container}>
        {/* Encabezado con logo y título */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <Image
            src="/logo-8choq.png"
            alt="8CHOQ"
            width={80}
            height={40}
            priority
          />
          <h1 style={{ fontSize: "18px", fontWeight: "bold", margin: 0 }}>
            Sistema de Remitos 8CHOQ (Prototipo)
          </h1>
        </div>

        {/* Formulario de cabecera: 2 columnas */}
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={grid2}>
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
                  placeholder="Documento"
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

              <div style={{ marginBottom: 10 }}>
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
                    style={input}
                    type="number"
                    inputMode="numeric"
                    value={String(costoEnvio)}
                    onChange={(e) => setCostoEnvio(Number(e.target.value || 0))}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabla de items */}
        <div style={{ overflowX: "auto", marginBottom: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Código</th>
                <th style={th}>Artículo</th>
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
              {items.map((it, idx) => {
                const cant =
                  it.talles.S +
                  it.talles.M +
                  it.talles.L +
                  it.talles.XL +
                  it.talles.XXL +
                  it.talles.XXXL;
                const total = cant * it.aPagar;

                return (
                  <tr key={idx}>
                    <td style={td}>
                      <input
                        style={input}
                        value={it.codigo}
                        onChange={handleItemField(idx, "codigo")}
                        placeholder="Código"
                      />
                    </td>
                    <td style={td}>
                      <input
                        style={input}
                        value={it.articulo}
                        onChange={handleItemField(idx, "articulo")}
                        placeholder="Artículo"
                      />
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <input
                        style={smallInput}
                        type="number"
                        inputMode="numeric"
                        value={it.aPagar || 0}
                        onChange={handleItemField(idx, "aPagar")}
                      />
                    </td>
                    {(["S", "M", "L", "XL", "XXL", "XXXL"] as (keyof Talles)[]).map(
                      (talle) => (
                        <td key={talle} style={{ ...td, textAlign: "right" }}>
                          <input
                            style={smallInput}
                            type="number"
                            inputMode="numeric"
                            value={it.talles[talle] || 0}
                            onChange={handleTalle(idx, talle)}
                          />
                        </td>
                      )
                    )}
                    <td style={{ ...td, textAlign: "right" }}>{cant}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      ${total.toFixed(0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totales */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
          <div className="no-print" style={{ display: "flex", gap: 8 }}>
            <button
              onClick={clearTable}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Limpiar
            </button>
            <button
              onClick={addRow}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              + Agregar fila
            </button>
          </div>

          <div style={{ textAlign: "right", fontSize: 14 }}>
            <div> <strong>Total Prendas:</strong> {totalPrendas}</div>
            <div> <strong>Subtotal:</strong> ${subtotal.toFixed(0)}</div>
            <div>
              <strong>Descuento ({descuento}%):</strong> -${montoDescuento.toFixed(0)}
            </div>
            <div> <strong>Envío:</strong> ${Number(costoEnvio || 0).toFixed(0)}</div>
            <div style={{ fontSize: 16, marginTop: 4 }}>
              <strong>Total:</strong> ${totalFinal.toFixed(0)}
            </div>
          </div>
        </div>
      </div>

      {/* Acciones (fuera del área de impresión) */}
      <div className="no-print" style={{ margin: "12px auto", width: "210mm" }}>
        <button
          onClick={handleDownloadPDF}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #10b981",
            background: "#10b981",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Descargar PDF
        </button>
      </div>
    </div>
  );
}
