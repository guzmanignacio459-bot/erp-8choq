"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

/** ======== Tipos ========= */
type Item = {
  codigo: string;
  articulo: string;
  aPagar: number;
  talles: { [k: string]: number };
  cantidad: number;
  total: number;
  notas: string;
};

/** ======== Página ========= */
export default function Remito8CHOQ() {
  /* ------- estado ------- */
  const emptyItem = (): Item => ({
    codigo: "",
    articulo: "",
    aPagar: 0,
    talles: { S: 0, M: 0, L: 0, XL: 0, XXL: 0, XXXL: 0 },
    cantidad: 0,
    total: 0,
    notas: "",
  });

  // 8 filas (entra perfecto en A4)
  const [items, setItems] = useState<Item[]>(
    Array.from({ length: 8 }, () => emptyItem())
  );

  const [cliente, setCliente] = useState("");
  const [fecha, setFecha] = useState(
    new Date().toISOString().slice(0, 10) // yyyy-mm-dd -> date picker
  );
  const [dni, setDni] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [envio, setEnvio] = useState("");
  const [metodoPago, setMetodoPago] = useState("");
  const [provincia, setProvincia] = useState("Mendoza");
  const [costoEnvio, setCostoEnvio] = useState(0);
  const [descuento, setDescuento] = useState(0);

  /* ------- catálogos ------- */
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
    { label: "Minorista 10%", value: 10 },
  ];

  /* ------- helpers ------- */
  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems((p) =>
      p.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    );
  };

  const handleQty = (
    row: number,
    key: keyof Item["talles"],
    delta: number
  ) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== row) return it;
        const next = Math.max(0, (it.talles[key] ?? 0) + delta);
        const talles = { ...it.talles, [key]: next };
        const cantidad = Object.values(talles).reduce((a, b) => a + b, 0);
        const total = cantidad * (it.aPagar || 0);
        return { ...it, talles, cantidad, total };
      })
    );
  };

  /* ------- totales ------- */
  const totals = useMemo(() => {
    const prendas = items.reduce((a, i) => a + i.cantidad, 0);
    const subtotal = items.reduce((a, i) => a + i.total, 0);
    const desc = Math.round((subtotal * descuento) / 100);
    const total = Math.max(0, subtotal - desc + (costoEnvio || 0));
    return { prendas, subtotal, desc, total };
  }, [items, descuento, costoEnvio]);

  /* ------- PDF ------- */
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

    // ancho A4 ~ 794px @96dpi; capturamos a 2x para nitidez
    const canvas = await html2canvas(el, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = 210; // mm
    const imgProps = (pdf as any).getImageProperties(imgData);
    const pdfHeight = (imgProps.height * pageWidth) / imgProps.width;

    pdf.addImage(imgData, "PNG", 0, 0, pageWidth, pdfHeight);
    pdf.save(`Remito-${cliente || "8CHOQ"}.pdf`);
  };

  /* ------- UI helpers ------- */
  const QtyControl = ({
    value,
    onInc,
    onDec,
    label,
  }: {
    value: number;
    onInc: () => void;
    onDec: () => void;
    label?: string;
  }) => (
    <div className="qty">
      {/* etiqueta de talle arriba en pantallas chicas */}
      {label ? <span className="qtyLabel">{label}</span> : null}
      <button type="button" className="qtyBtn" onClick={onDec} aria-label="menos">
        –
      </button>
      <input className="qtyInput" readOnly value={value} />
      <button type="button" className="qtyBtn" onClick={onInc} aria-label="más">
        +
      </button>
      <style jsx>{`
        .qty {
          display: inline-flex;
          align-items: center;
          gap: 6px;                /* <-- ESPACIO ENTRE CONTROLES */
          border: 1px solid #e6e6e6;
          border-radius: 8px;
          padding: 4px 6px;
          background: #fff;
          min-width: 88px;         /* ancho mínimo para que quepan los 3 */
          justify-content: center;
        }
        .qtyLabel {
          display: none;
          font-size: 10px;
          color: #666;
          margin-right: 4px;
        }
        .qtyBtn {
          width: 24px;
          height: 24px;
          border: 1px solid #e1e1e1;
          background: #fafafa;
          border-radius: 6px;
          line-height: 1;
          font-size: 16px;
        }
        .qtyInput {
          width: 28px;
          text-align: center;
          border: none;
          background: transparent;
          font-weight: 600;
        }
        @media (max-width: 680px) {
          .qty {
            min-width: 76px;
            gap: 4px;
          }
          .qtyLabel {
            display: inline;
          }
        }
      `}</style>
    </div>
  );

  /* ------- layout ------- */
  return (
    <div className="wrap">
      <div id="remito-container" className="sheet">
        {/* Header */}
        <div className="header">
          <div className="brand">
            {/* logo si existe */}
            <div className="logoBox">
              {/* si el .png está en /public, mostralo; si no, fallback */}
              <Image
                src="/logo-8choq.png"
                alt="8CHOQ"
                width={90}
                height={40}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
                priority
              />
              <span className="logoFallback">8CHOQ</span>
            </div>
            <h1>Sistema de Remitos 8CHOQ (Prototipo)</h1>
          </div>
        </div>

        {/* Datos */}
        <section className="card grid2">
          <div>
            <label>Nombre</label>
            <input
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Cliente"
            />
          </div>

          <div>
            <label>Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>

          <div>
            <label>DNI</label>
            <input
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              placeholder="DNI"
            />
          </div>

          <div>
            <label>Envío</label>
            <select value={envio} onChange={(e) => setEnvio(e.target.value)}>
              <option value="">Seleccionar...</option>
              {envios.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Vendedor</label>
            <select
              value={vendedor}
              onChange={(e) => setVendedor(e.target.value)}
            >
              <option value="">Seleccionar...</option>
              {vendedores.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Método de Pago</label>
            <select
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value)}
            >
              <option value="">Seleccionar...</option>
              {metodosPago.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Descuento</label>
            <select
              value={descuento}
              onChange={(e) => setDescuento(Number(e.target.value))}
            >
              {descuentos.map((d) => (
                <option key={d.label} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Provincia / Localidad</label>
            <input
              value={provincia}
              onChange={(e) => setProvincia(e.target.value)}
              placeholder="Provincia / Localidad"
            />
          </div>

          <div>
            <label>Costo de Envío ($)</label>
            <input
              type="number"
              min={0}
              value={costoEnvio}
              onChange={(e) => setCostoEnvio(Number(e.target.value || 0))}
            />
          </div>
        </section>

        {/* Tabla */}
        <section className="card tableCard">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 140 }}>Código</th>
                <th style={{ width: 320 }}>Artículo</th>
                <th style={{ width: 90 }}>A Pagar</th>
                <th>S</th>
                <th>M</th>
                <th>L</th>
                <th>XL</th>
                <th>XXL</th>
                <th>XXXL</th>
                <th style={{ width: 70 }}>Cant</th>
                <th style={{ width: 90 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr key={i}>
                  <td>
                    <input
                      value={row.codigo}
                      onChange={(e) => updateItem(i, { codigo: e.target.value })}
                      placeholder="Código"
                    />
                  </td>
                  <td>
                    <input
                      value={row.articulo}
                      onChange={(e) =>
                        updateItem(i, { articulo: e.target.value })
                      }
                      placeholder="Artículo"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={row.aPagar}
                      onChange={(e) => {
                        const aPagar = Number(e.target.value || 0);
                        const total = row.cantidad * aPagar;
                        updateItem(i, { aPagar, total });
                      }}
                    />
                  </td>

                  {(["S", "M", "L", "XL", "XXL", "XXXL"] as const).map((t) => (
                    <td key={t}>
                      <QtyControl
                        value={row.talles[t]}
                        label={t}
                        onDec={() => handleQty(i, t, -1)}
                        onInc={() => handleQty(i, t, +1)}
                      />
                    </td>
                  ))}

                  <td className="num">{row.cantidad}</td>
                  <td className="num">
                    ${new Intl.NumberFormat("es-AR").format(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Footer: resumen alineado a la derecha */}
        <section className="footerRow">
          <div className="totalsCard">
            <div className="r">
              <span>Total prendas</span>
              <b>{totals.prendas}</b>
            </div>
            <div className="r">
              <span>Subtotal</span>
              <b>${new Intl.NumberFormat("es-AR").format(totals.subtotal)}</b>
            </div>
            <div className="r">
              <span>Descuento</span>
              <b>-$
                {new Intl.NumberFormat("es-AR").format(totals.desc)}
              </b>
            </div>
            <div className="r">
              <span>Envío</span>
              <b>${new Intl.NumberFormat("es-AR").format(costoEnvio)}</b>
            </div>
            <div className="r total">
              <span>TOTAL</span>
              <b>${new Intl.NumberFormat("es-AR").format(totals.total)}</b>
            </div>
          </div>
        </section>
      </div>

      {/* acciones */}
      <div className="actions no-print">
        <button className="btn" onClick={handleDownloadPDF}>
          Descargar PDF
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            setItems(Array.from({ length: 8 }, () => emptyItem()));
            setCliente("");
            setDni("");
            setVendedor("");
            setEnvio("");
            setMetodoPago("");
            setProvincia("Mendoza");
            setCostoEnvio(0);
            setDescuento(0);
            setFecha(new Date().toISOString().slice(0, 10));
          }}
        >
          Limpiar
        </button>
        <button className="btn ghost" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>

      {/* ====== estilos ====== */}
      <style jsx>{`
        .wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px;
          background: #f5f6f8;
        }
        .sheet {
          width: 210mm;                 /* A4 real */
          max-width: 100%;
          background: #fff;
          border-radius: 14px;
          box-shadow: 0 6px 24px rgba(0,0,0,.06);
          padding: 18px 18px 12px;
        }

        .header .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
        }
        .logoBox {
          width: 90px;
          height: 40px;
          border-radius: 8px;
          display: grid;
          place-items: center;
          position: relative;
        }
        .logoFallback {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          font-weight: 800;
          letter-spacing: 1px;
          color: #111;
        }
        h1 {
          font-size: 18px;
          margin: 0;
          font-weight: 700;
        }

        .card {
          border: 1px solid #eee;
          border-radius: 12px;
          padding: 12px;
          margin-bottom: 10px;
        }
        .grid2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px 16px;
        }
        label {
          display: block;
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 6px;
          font-weight: 600;
        }
        input, select, textarea {
          width: 100%;
          height: 38px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 0 10px;
          font-size: 14px;
          background: #fff;
        }

        .tableCard { padding: 8px; }
        .table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;          /* IMPORTANTE: sin scroll horizontal */
        }
        .table th, .table td {
          border-bottom: 1px solid #f0f0f0;
          padding: 8px;
          vertical-align: middle;
          text-align: left;
        }
        .table thead th {
          font-size: 12px;
          color: #6b7280;
          font-weight: 700;
        }
        .table input {
          height: 34px;
        }
        .num { text-align: right; font-weight: 700; }

        .footerRow {
          display: flex;
          justify-content: flex-end;
          margin-top: 4px;
        }
        .totalsCard {
          width: 240px;
          border: 1px solid #eee;
          border-radius: 12px;
          padding: 10px 12px;
          background: #fafafa;
        }
        .totalsCard .r {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 0;
          border-bottom: 1px dashed #e6e6e6;
          font-size: 14px;
        }
        .totalsCard .r:last-child { border-bottom: none; }
        .totalsCard .r.total span { font-weight: 800; }
        .totalsCard .r.total b { font-size: 18px; }

        .actions {
          width: 210mm;
          max-width: 100%;
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }
        .btn {
          height: 40px;
          padding: 0 14px;
          border-radius: 10px;
          border: 1px solid #e5e7eb;
          background: #111;
          color: #fff;
          font-weight: 600;
        }
        .btn.ghost {
          background: #fff;
          color: #111;
        }

        /* ===== PRINT (A4) ===== */
        @media print {
          @page { size: A4; margin: 10mm; } /* margen chico, entra 1 hoja */
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .wrap { padding: 0; }
          .sheet {
            width: auto;
            padding: 0;
            box-shadow: none;
            border: none;
          }
          .card { margin-bottom: 8px; }
        }

        @media (max-width: 780px) {
          .grid2 { grid-template-columns: 1fr; }
          .footerRow { justify-content: stretch; }
          .totalsCard { width: 100%; }
        }
      `}</style>
    </div>
  );
}
