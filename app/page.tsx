"use client";

import { useMemo, useState } from "react";

/* =======================
   Tipos y helpers
======================= */
type Item = {
  codigo: string;
  articulo: string;
  aPagar: number;
  talles: { S: number; M: number; L: number; XL: number; XXL: number; XXXL: number };
};

const emptyItem = (): Item => ({
  codigo: "",
  articulo: "",
  aPagar: 0,
  talles: { S: 0, M: 0, L: 0, XL: 0, XXL: 0, XXXL: 0 },
});

/* =======================
   Componente principal
======================= */
export default function Remito8CHOQ() {
  // 8 filas por defecto
  const [items, setItems] = useState<Item[]>(Array.from({ length: 8 }, emptyItem));

  const [cliente, setCliente] = useState("");
  const [fecha, setFecha] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  });
  const [dni, setDni] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [envio, setEnvio] = useState("");
  const [metodoPago, setMetodoPago] = useState("");
  const [provincia, setProvincia] = useState("Mendoza");
  const [costoEnvio, setCostoEnvio] = useState<number>(0);
  const [descuento, setDescuento] = useState<number>(0);

  // Opciones
  const vendedores = ["Nacho", "Santi", "Paula", "Malena"];
  const envios = [
    "Correo – Sucursal",
    "Correo – Domicilio",
    "Andreani – Sucursal",
    "Andreani – Domicilio",
    "OCA",
    "Send Box",
    "Retira",
    "Domicilio",
  ];
  const metodosPago = ["MP 1 cuota", "MP 3 cuotas", "Transferencia 1", "Transferencia 2", "Efectivo", "Debito", "QR"];
  const descuentos = [
    { label: "Sin descuento", value: 0 },
    { label: "Mayorista 5%", value: 5 },
    { label: "Minorista 10%", value: 10 },
  ];

  /* ============ Totales ============ */
  const totals = useMemo(() => {
    const totalPrendas = items.reduce(
      (acc, it) => acc + it.talles.S + it.talles.M + it.talles.L + it.talles.XL + it.talles.XXL + it.talles.XXXL,
      0
    );

    const subtotal = items.reduce((acc, it) => acc + (it.aPagar || 0), 0);
    const descuentoMonto = Math.round((subtotal * descuento) / 100);
    const total = Math.max(0, subtotal - descuentoMonto + (costoEnvio || 0));

    return { totalPrendas, subtotal, descuentoMonto, total };
  }, [items, costoEnvio, descuento]);

  /* ============ Acciones filas ============ */
  const addRow = () => setItems((prev) => [...prev, emptyItem()]);
  const onChangeItem = <K extends keyof Item>(idx: number, key: K, value: Item[K]) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  };
  const onChangeTalle = (idx: number, talle: keyof Item["talles"], value: number) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], talles: { ...next[idx].talles, [talle]: Math.max(0, value || 0) } };
      return next;
    });
  };

  /* ============ Descargar PDF ============ */
  const handleDownloadPDF = async () => {
    const el = document.getElementById("remito-container");
    if (!el) return;

    try {
      const [jspdfMod, html2canvasMod] = await Promise.all([import("jspdf"), import("html2canvas")]);
      const jsPDF = (jspdfMod as any).jsPDF ?? (jspdfMod as any).default;
      const html2canvas = (html2canvasMod as any).default ?? html2canvasMod;

      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = 210;
      const imgProps = (pdf as any).getImageProperties(imgData);
      const pdfHeight = (imgProps.height * pageWidth) / imgProps.width;

      pdf.addImage(imgData, "PNG", 0, 0, pageWidth, pdfHeight);
      pdf.save(`Remito-${cliente || "8CHOQ"}.pdf`);
    } catch {
      alert("Para descargar el PDF, instalá 'jspdf' y 'html2canvas' en el proyecto.");
    }
  };

  return (
    <div className="page">
      <div className="sheet a4" id="remito-container">
        {/* Header */}
        <div className="header">
          <div className="logoWrap">
            <img src="/logo-8choq.png" alt="8CHOQ" width={90} height={40} />
          </div>
          <h1>Sistema de Remitos 8CHOQ (Prototipo)</h1>
        </div>

        {/* Datos */}
        <div className="card grid2">
          <div className="field">
            <label>Nombre</label>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Cliente" />
          </div>

          <div className="field">
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>

          <div className="field">
            <label>DNI</label>
            <input value={dni} onChange={(e) => setDni(e.target.value)} placeholder="DNI" />
          </div>

          <div className="field">
            <label>Envío</label>
            <select value={envio} onChange={(e) => setEnvio(e.target.value)}>
              <option value="">Seleccionar...</option>
              {envios.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Vendedor</label>
            <select value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
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
            <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
              <option value="">Seleccionar...</option>
              {metodosPago.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Descuento</label>
            <select value={descuento} onChange={(e) => setDescuento(Number(e.target.value))}>
              {descuentos.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Provincia / Localidad</label>
            <input value={provincia} onChange={(e) => setProvincia(e.target.value)} placeholder="Provincia / Localidad" />
          </div>

          <div className="field">
            <label>Costo de Envío ($)</label>
            <input type="number" value={costoEnvio} onChange={(e) => setCostoEnvio(Number(e.target.value))} min={0} />
          </div>
        </div>

        {/* Tabla */}
        <div className="card">
          {/* Encabezado alineado con la grilla de filas */}
          <div className="tableHead">
            <div className="col code">Código</div>
            <div className="col articulo">Artículo</div>
            <div className="col pagar">A Pagar</div>
            <div className="sizesHead">
              {["S", "M", "L", "XL", "XXL", "XXXL", "Cant"].map((l) => (
                <div key={l}>{l}</div>
              ))}
            </div>
          </div>

          {items.map((it, i) => {
            const cant =
              it.talles.S + it.talles.M + it.talles.L + it.talles.XL + it.talles.XXL + it.talles.XXXL;

            return (
              <div className="row" key={i}>
                <div className="col code">
                  <input
                    placeholder="Código"
                    value={it.codigo}
                    onChange={(e) => onChangeItem(i, "codigo", e.target.value)}
                  />
                </div>

                <div className="col articulo">
                  <input
                    placeholder="Nombre de la prenda"
                    value={it.articulo}
                    onChange={(e) => onChangeItem(i, "articulo", e.target.value)}
                  />
                </div>

                <div className="col pagar">
                  <input
                    type="number"
                    min={0}
                    value={Number.isFinite(it.aPagar) ? it.aPagar : 0}
                    onChange={(e) => onChangeItem(i, "aPagar", Number(e.target.value))}
                  />
                </div>

                <div className="col sizesGrid">
                  {(["S", "M", "L", "XL", "XXL", "XXXL"] as const).map((talle) => (
                    <div className="qtyCell" key={talle}>
                      <input
                        type="number"
                        min={0}
                        value={(it.talles as any)[talle]}
                        onChange={(e) => onChangeTalle(i, talle, Number(e.target.value))}
                      />
                    </div>
                  ))}
                  <div className="qtyCell totalQty">
                    <span>{cant}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Acciones de filas (no se imprime) */}
          <div className="rowActions no-print">
            <button className="btn ghost" onClick={addRow}>
              + Agregar fila
            </button>
          </div>
        </div>

        {/* Totales inferiores */}
        <div className="totalsWrap">
          <div className="totRow">
            <span>Total Prendas</span>
            <b>{totals.totalPrendas}</b>
          </div>
          <div className="totRow">
            <span>Subtotal</span>
            <b>${totals.subtotal}</b>
          </div>
          <div className="totRow">
            <span>Descuento</span>
            <b>-${totals.descuentoMonto}</b>
          </div>
          <div className="totRow">
            <span>Envío</span>
            <b>${costoEnvio || 0}</b>
          </div>
          <div className="totRow grand">
            <span>TOTAL</span>
            <b>${totals.total}</b>
          </div>
        </div>
      </div>

      {/* Acciones (no se imprimen) */}
      <div className="footerActions no-print">
        <button className="btn" onClick={handleDownloadPDF}>
          Descargar PDF
        </button>
      </div>

      {/* ======== ESTILOS ======== */}
      <style jsx>{`
        :root {
          --card: #ffffff;
          --stroke: #e5e7eb;
          --muted: #6b7280;
          --text: #111827;
          --bg: #f7f7f7;
          --radius: 12px;
        }
        * { box-sizing: border-box; }
        body { background: var(--bg); }

        .page {
          display: flex; flex-direction: column; align-items: center;
          gap: 16px; padding: 16px 10px 48px;
        }
        .sheet.a4 {
          width: 794px; background: #fff; color: var(--text);
          box-shadow: 0 6px 20px rgba(0,0,0,.08);
          border-radius: var(--radius);
          padding: 18px 18px 12px;
        }

        .header {
          display: grid; grid-template-columns: 110px 1fr;
          align-items: center; gap: 12px; margin-bottom: 10px;
        }
        .logoWrap {
          display:flex; align-items:center; justify-content:center;
          height: 46px; border:1px solid var(--stroke); border-radius:10px; background:#fff;
        }
        h1 { font-size: 18px; margin: 0; }

        .card {
          background: var(--card);
          border: 1px solid var(--stroke);
          border-radius: var(--radius);
          padding: 12px;
          margin-bottom: 10px;
        }

        .grid2 {
          display: grid; grid-template-columns: 1fr 1fr; gap: 10px 10px;
        }
        .field { display: grid; gap: 6px; }
        .field label { font-size: 12px; color: var(--muted); }
        .field input, .field select {
          height: 36px; border: 1px solid var(--stroke); border-radius: 10px; padding: 0 10px; outline: none;
        }

        /* Tabla: 4 columnas -> code | articulo | pagar | sizesGrid */
        .tableHead, .row {
          display: grid;
          grid-template-columns: 160px 1fr 120px 1fr;
          gap: 8px; align-items: center;
        }
        .tableHead { padding: 4px 2px 8px; }
        .tableHead .col { font-size: 12px; color: var(--muted); }
        .sizesHead {
          display: grid; grid-template-columns: repeat(7, 56px);
          column-gap: 12px; justify-content: center; text-align: center; font-size: 12px; color: var(--muted);
        }

        .row { padding: 6px 2px; }
        .row + .row { border-top: 1px dashed var(--stroke); }

        .col.code input, .col.articulo input, .col.pagar input {
          width: 100%; height: 34px; border: 1px solid var(--stroke);
          border-radius: 10px; padding: 0 10px;
        }

        /* --- MÁS AIRE ENTRE TALLES --- */
        .sizesGrid {
          display: grid; grid-template-columns: repeat(7, 56px); /* S M L XL XXL XXXL Cant */
          column-gap: 12px; row-gap: 8px; justify-content: center; align-items: center;
        }
        .qtyCell { display:flex; align-items:center; justify-content:center; }
        .qtyCell input[type="number"] {
          width: 56px; height: 34px; text-align: center; font-size: 14px;
          border: 1px solid var(--stroke); border-radius: 10px; padding: 2px 6px;
        }
        .qtyCell.totalQty span { font-weight: 600; }

        .rowActions { padding-top: 8px; }
        .btn { height: 36px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--stroke); background: #fff; cursor: pointer; }
        .btn.ghost { background: #fff; }

        /* Totales */}
        .totalsWrap {
          width: 280px; margin-left: auto; background: #fff; border: 1px solid var(--stroke);
          border-radius: var(--radius); padding: 10px 12px; display: grid; gap: 6px;
        }
        .totRow { display: grid; grid-template-columns: 1fr auto; align-items: center; font-size: 14px; }
        .totRow span { color: var(--muted); }
        .totRow.grand span { color: #111; font-weight: 600; }
        .totRow b { font-weight: 700; }

        .footerActions { width: 794px; display: flex; justify-content: flex-end; gap: 8px; }

        /* ---- PRINT ---- */
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          .page { padding: 0; }
          .sheet.a4 { box-shadow: none; width: 210mm; padding: 10mm; }
          .totalsWrap { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
