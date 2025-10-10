"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

/** ==== Tipos ==== */
type Item = {
  codigo: string;
  articulo: string;
  aPagar: number;
  talles: { [key: string]: number };
  cantidad: number;
  total: number;
  notas: string;
};

/** Fila vacía */
const emptyItem = (): Item => ({
  codigo: "",
  articulo: "",
  aPagar: 0,
  talles: { S: 0, M: 0, L: 0, XL: 0, XXL: 0 },
  cantidad: 0,
  total: 0,
  notas: "",
});

/** ==== Página ==== */
export default function Remito8CHOQ() {
  /** ===== Estado ===== */
  // 8 filas para que entre en 1 A4
  const [items, setItems] = useState<Item[]>(
    Array.from({ length: 8 }, () => emptyItem())
  );
  const [cliente, setCliente] = useState("");
  const [fecha, setFecha] = useState(
    new Date().toISOString().slice(0, 10) // yyyy-mm-dd para <input type="date">
  );
  const [dni, setDni] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [envio, setEnvio] = useState("");
  const [metodoPago, setMetodoPago] = useState("");
  const [provincia, setProvincia] = useState("Mendoza");
  const [costoEnvio, setCostoEnvio] = useState<number>(0);
  const [descuento, setDescuento] = useState<number>(0); // 0, 5, 10

  /** ===== Opciones ===== */
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

  /** ===== Handlers ===== */
  const setItemField = <K extends keyof Item>(
    idx: number,
    key: K,
    value: Item[K]
  ) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      // Recalcular cantidad/total si cambiaron talles/aPagar
      const t = next[idx].talles;
      const cantidad =
        (t.S || 0) + (t.M || 0) + (t.L || 0) + (t.XL || 0) + (t.XXL || 0);
      const total = (next[idx].aPagar || 0) * cantidad;
      next[idx].cantidad = cantidad;
      next[idx].total = total;
      return next;
    });
  };

  const setItemTalle = (idx: number, talle: keyof Item["talles"], val: number) =>
    setItems((prev) => {
      const next = [...prev];
      const n = { ...next[idx] };
      n.talles = { ...n.talles, [talle]: val };
      const cant =
        (n.talles.S || 0) +
        (n.talles.M || 0) +
        (n.talles.L || 0) +
        (n.talles.XL || 0) +
        (n.talles.XXL || 0);
      n.cantidad = cant;
      n.total = (n.aPagar || 0) * cant;
      next[idx] = n;
      return next;
    });

  const clearTable = () =>
    setItems(Array.from({ length: 8 }, () => emptyItem()));

  /** ===== Totales ===== */
  const totals = useMemo(() => {
    const totalPrendas = items.reduce((a, i) => a + (i.cantidad || 0), 0);
    const subtotal = items.reduce((a, i) => a + (i.total || 0), 0);
    const descMonto = Math.round((subtotal * (descuento || 0)) / 100);
    const total = subtotal - descMonto + (costoEnvio || 0);
    return { totalPrendas, subtotal, descMonto, total };
  }, [items, descuento, costoEnvio]);

  /** ===== Descargar PDF (html2canvas + jsPDF) ===== */
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

    // Capturamos en escala 2 para que salga nítido
    const canvas = await html2canvas(el, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");

    // A4: 210 x 297 mm
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = 210;
    const imgProps = pdf.getImageProperties(imgData);
    const pdfHeight = (imgProps.height * pageWidth) / imgProps.width;

    pdf.addImage(imgData, "PNG", 0, 0, pageWidth, pdfHeight);
    pdf.save(`Remito-${cliente || "8CHOQ"}.pdf`);
  };

  return (
    <div className="page">
      <div id="remito-container" className="sheet">
        {/* Header: logo + título */}
        <div className="topbar">
          <div className="brand">
            {/* Si el logo no aparece, confirmá que exista /public/logo-8choq.png */}
            <Image
              src="/logo-8choq.png"
              alt="8CHOQ"
              width={70}
              height={28}
              priority
            />
          </div>
          <h1>Sistema de Remitos 8CHOQ (Prototipo)</h1>
        </div>

        {/* Datos del remito */}
        <section className="card grid-2">
          <div className="field">
            <label>Nombre</label>
            <input
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Cliente"
            />
          </div>
          <div className="field">
            <label>Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>

          <div className="field">
            <label>DNI</label>
            <input
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              placeholder="DNI"
            />
          </div>
          <div className="field">
            <label>Envío</label>
            <select value={envio} onChange={(e) => setEnvio(e.target.value)}>
              <option value="">Seleccionar...</option>
              {envios.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Vendedor</label>
            <select
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
          <div className="field">
            <label>Método de Pago</label>
            <select
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

          <div className="field">
            <label>Descuento</label>
            <select
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
          <div className="field grid-2-span">
            <label>Provincia / Localidad</label>
            <input
              value={provincia}
              onChange={(e) => setProvincia(e.target.value)}
              placeholder="Provincia / Localidad"
            />
          </div>

          <div className="field">
            <label>Costo de Envío ($)</label>
            <input
              type="number"
              value={costoEnvio}
              onChange={(e) => setCostoEnvio(Number(e.target.value || 0))}
              min={0}
            />
          </div>
        </section>

        {/* Tabla compacta para entrar en A4 */}
        <section className="card">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 100 }}>Código</th>
                <th style={{ width: 240 }}>Artículo</th>
                <th style={{ width: 70 }}>A Pagar</th>
                <th>S</th>
                <th>M</th>
                <th>L</th>
                <th>XL</th>
                <th>XXL</th>
                <th style={{ width: 70 }}>Cant</th>
                <th style={{ width: 75 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td>
                    <input
                      className="i"
                      value={it.codigo}
                      onChange={(e) => setItemField(idx, "codigo", e.target.value)}
                      placeholder="Código"
                    />
                  </td>
                  <td>
                    <input
                      className="i"
                      value={it.articulo}
                      onChange={(e) =>
                        setItemField(idx, "articulo", e.target.value)
                      }
                      placeholder="Artículo"
                    />
                  </td>
                  <td>
                    <input
                      className="i num"
                      type="number"
                      min={0}
                      value={it.aPagar}
                      onChange={(e) =>
                        setItemField(idx, "aPagar", Number(e.target.value || 0))
                      }
                    />
                  </td>
                  {(["S", "M", "L", "XL", "XXL"] as const).map((t) => (
                    <td key={t}>
                      <input
                        className="i num size"
                        type="number"
                        min={0}
                        value={it.talles[t] || 0}
                        onChange={(e) =>
                          setItemTalle(idx, t, Number(e.target.value || 0))
                        }
                      />
                    </td>
                  ))}
                  <td className="right">{it.cantidad || 0}</td>
                  <td className="right">${it.total || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Totales */}
        <section className="totales">
          <div>Total Prendas: {totals.totalPrendas}</div>
          <div>Subtotal: ${totals.subtotal}</div>
          <div>Descuento: -${totals.descMonto}</div>
          <div>Envío: ${costoEnvio}</div>
          <div className="total">TOTAL: ${totals.total}</div>
        </section>
      </div>

      {/* Acciones (no se imprimen) */}
      <div className="actions no-print">
        <button className="ghost" onClick={clearTable}>
          Limpiar
        </button>
        <button className="primary" onClick={handleDownloadPDF}>
          Descargar PDF
        </button>
      </div>

      {/* ====== ESTILOS ====== */}
      <style jsx>{`
        /* Layout general */
        .page {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px;
          background: #f5f5f7;
          color: #111;
        }

        /* Hoja A4 virtual: 190mm ancho para dejar márgenes al imprimir */
        .sheet {
          width: 190mm; /* ~720px */
          background: #fff;
          border-radius: 10px;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.07);
          padding: 10mm;
        }

        .topbar {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }

        .brand {
          width: 70px;
          height: 28px;
          display: flex;
          align-items: center;
        }

        h1 {
          font-size: 18px;
          margin: 0;
          font-weight: 700;
        }

        .card {
          border: 1px solid #e6e7eb;
          border-radius: 10px;
          padding: 10px;
          margin-top: 10px;
        }

        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px 12px;
        }

        .grid-2-span {
          grid-column: span 1;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .field label {
          font-size: 11px;
          color: #666;
        }
        .field input,
        .field select {
          height: 30px;
          padding: 0 10px;
          border: 1px solid #d9dbe0;
          border-radius: 8px;
          background: #fff;
          font-size: 12px;
        }

        /* Tabla compacta sin scroll horizontal */
        .table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed; /* ¡clave para que no se desborde! */
          font-size: 12px;
        }
        .table th,
        .table td {
          border: 1px solid #eceef2;
          padding: 6px;
          text-align: left;
        }
        .table thead th {
          background: #f7f8fa;
          font-weight: 600;
          text-align: left;
        }
        .i {
          width: 100%;
          height: 28px;
          padding: 0 8px;
          border: 1px solid #d9dbe0;
          border-radius: 8px;
          font-size: 12px;
          box-sizing: border-box;
        }
        .i.num {
          text-align: right;
        }
        .i.size {
          padding-right: 4px;
        }
        .right {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        .totales {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          margin-top: 10px;
          font-size: 12px;
        }
        .totales .total {
          grid-column: span 1;
          font-weight: 700;
        }

        .actions {
          width: 190mm;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 12px;
        }
        .primary,
        .ghost {
          height: 36px;
          padding: 0 14px;
          border-radius: 10px;
          font-weight: 600;
          border: 1px solid transparent;
        }
        .primary {
          background: #17a34a;
          color: #fff;
        }
        .ghost {
          background: transparent;
          border-color: #d9dbe0;
          color: #333;
        }

        /* ===== Print ===== */
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          :root,
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          .page {
            padding: 0;
            background: #fff;
          }
          .sheet {
            width: auto; /* el @page manda el ancho */
            box-shadow: none;
            border-radius: 0;
            padding: 0; /* ya dejamos margen con @page */
          }
          .card {
            border-color: #e6e7eb;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .table {
            font-size: 11px;
          }
          .i {
            height: 24px;
            font-size: 11px;
          }
          .field input,
          .field select {
            height: 26px;
            font-size: 11px;
          }
          .totales {
            font-size: 11px;
          }
        }
      `}</style>
    </div>
  );
}
