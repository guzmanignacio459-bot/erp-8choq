"use client";

import { useMemo, useState } from "react";

type Item = {
  codigo: string;
  articulo: string;
  aPagar: number;
  talles: { S: number; M: number; L: number; XL: number; XXL: number; XXXL: number };
};

const DEFAULT_ROWS = 10;

const emptyItem = (): Item => ({
  codigo: "",
  articulo: "",
  aPagar: 0,
  talles: { S: 0, M: 0, L: 0, XL: 0, XXL: 0, XXXL: 0 },
});

export default function RemitoPlanilla8CHOQ() {
  const [items, setItems] = useState<Item[]>(Array.from({ length: DEFAULT_ROWS }, emptyItem));

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
  const metodosPago = ["MP 1 cuota", "MP 3 cuotas", "Transferencia 1", "Transferencia 2", "Efectivo", "Débito", "QR"];

  const totals = useMemo(() => {
    const totalPrendas = items.reduce(
      (acc, it) => acc + it.talles.S + it.talles.M + it.talles.L + it.talles.XL + it.talles.XXL + it.talles.XXXL,
      0
    );
    const subtotal = items.reduce((acc, it) => {
      const cant = it.talles.S + it.talles.M + it.talles.L + it.talles.XL + it.talles.XXL + it.talles.XXXL;
      return acc + (it.aPagar || 0) * cant;
    }, 0);
    const total = Math.max(0, subtotal + (costoEnvio || 0));
    return { totalPrendas, subtotal, total };
  }, [items, costoEnvio]);

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
      const v = Math.max(0, value || 0);
      next[idx] = { ...next[idx], talles: { ...next[idx].talles, [talle]: v } };
      return next;
    });
  };

  const handleDownloadPDF = async () => {
    const el = document.getElementById("sheet");
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
      <div className="a4 sheet" id="sheet">
        {/* LOGO */}
        <div className="logoRow thick">
          <img src="/logo-8choq.png" alt="8CHOQ" className="logo" />
        </div>

        {/* BLOQUE DATOS (dos columnas) */}
        <div className="metaGrid">
          {/* fila 1 */}
          <div className="cell label thick">NOMBRE</div>
          <div className="cell thick">
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} />
          </div>
          <div className="cell label thick">ENVIO</div>
          <div className="cell thick">
            <select value={envio} onChange={(e) => setEnvio(e.target.value)}>
              <option value=""></option>
              {envios.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {/* fila 2 */}
          <div className="cell label thick">FECHA</div>
          <div className="cell thick">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="cell label thick">METODO DE PAGO</div>
          <div className="cell thick">
            <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
              <option value=""></option>
              {metodosPago.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {/* fila 3 */}
          <div className="cell label thick">DNI</div>
          <div className="cell thick">
            <input value={dni} onChange={(e) => setDni(e.target.value)} />
          </div>
          <div className="cell label thick">PROVINCIA/ LOCALIDAD</div>
          <div className="cell thick">
            <input value={provincia} onChange={(e) => setProvincia(e.target.value)} />
          </div>

          {/* fila 4 (vendedor toda la fila derecha) */}
          <div className="cell label thick">VENDEDOR</div>
          <div className="cell span3 thick">
            <select value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
              <option value=""></option>
              {vendedores.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ENCABEZADO DE TABLA */}
        <div className="tableHead thick">
          <div className="h cell center">CODIGO</div>
          <div className="h cell center">ARTICULO</div>
          <div className="h cell center">A PAGAR</div>
          <div className="h cell center">S</div>
          <div className="h cell center">M</div>
          <div className="h cell center">L</div>
          <div className="h cell center">XL</div>
          <div className="h cell center">XXL</div>
          <div className="h cell center">XXXL</div>
          <div className="h cell center">CANTIDAD</div>
          <div className="h cell center">TOTAL</div>
        </div>

        {/* FILAS */}
        <div className="rows">
          {items.map((it, i) => {
            const cant = it.talles.S + it.talles.M + it.talles.L + it.talles.XL + it.talles.XXL + it.talles.XXXL;
            const totalItem = (it.aPagar || 0) * cant;

            return (
              <div className="row" key={i}>
                <div className="cell">
                  <input value={it.codigo} onChange={(e) => onChangeItem(i, "codigo", e.target.value)} />
                </div>
                <div className="cell">
                  <input value={it.articulo} onChange={(e) => onChangeItem(i, "articulo", e.target.value)} />
                </div>
                <div className="cell">
                  <input
                    type="number"
                    min={0}
                    value={Number.isFinite(it.aPagar) ? it.aPagar : 0}
                    onChange={(e) => onChangeItem(i, "aPagar", Number(e.target.value))}
                  />
                </div>

                {(["S", "M", "L", "XL", "XXL", "XXXL"] as const).map((t) => (
                  <div className="cell center" key={t}>
                    <input
                      className="qty"
                      type="number"
                      min={0}
                      value={(it.talles as any)[t]}
                      onChange={(e) => onChangeTalle(i, t, Number(e.target.value))}
                    />
                  </div>
                ))}

                <div className="cell right mono">{cant}</div>
                <div className="cell right mono">${totalItem.toFixed(2)}</div>
              </div>
            );
          })}
        </div>

        {/* PIE – TOTALES */}
        <div className="footGrid">
          <div className="cell label thick span9 right">TOTAL PRENDAS</div>
          <div className="cell thick right mono">{totals.totalPrendas}</div>
          <div className="cell thick"></div>

          <div className="cell label thick span9 right">ENVIO</div>
          <div className="cell thick right">
            <input
              className="right"
              type="number"
              min={0}
              value={costoEnvio}
              onChange={(e) => setCostoEnvio(Number(e.target.value))}
            />
          </div>
          <div className="cell thick"></div>

          <div className="cell label thick span9 right">TOTAL</div>
          <div className="cell thick right mono">${totals.total.toFixed(2)}</div>
          <div className="cell thick"></div>
        </div>
      </div>

      {/* Acciones (no print) */}
      <div className="actions no-print">
        <button onClick={addRow}>+ Agregar fila</button>
        <button onClick={handleDownloadPDF}>Descargar PDF</button>
      </div>

      <style jsx>{`
        :root {
          --line: #000;            /* líneas negras como planilla */
          --light: #e5e7eb;
          --bg: #fff;
          --text: #000;
          --label: #000;
          --font: 13.5px;          /* tamaño base parecido a tu hoja */
          --rowH: 32px;            /* alto de fila tipo Excel */
          --thick: 2px;            /* grosor de líneas gruesas */
          --thin: 1px;
        }
        * { box-sizing: border-box; }
        body { background: #f6f6f6; }

        .page { display:flex; flex-direction:column; align-items:center; gap:12px; padding:16px; }
        .a4.sheet {
          width: 794px; background: var(--bg); color: var(--text);
          box-shadow: 0 6px 24px rgba(0,0,0,.08);
          padding: 8px;   /* bordes finos */
        }

        .thick { border: var(--thick) solid var(--line); }
        .logoRow {
          height: 90px; display:flex; align-items:center; justify-content:center; margin-bottom: 6px;
        }
        .logo { height: 84px; object-fit: contain; }

        /* Meta grid (dos columnas) — 4 filas */
        .metaGrid {
          display: grid;
          grid-template-columns: 160px 1fr 180px 1fr;  /* medidas similares a tu hoja */
          gap: 0; font-size: var(--font); margin-bottom: 6px;
        }
        .metaGrid .cell { border: var(--thin) solid var(--line); height: var(--rowH); display:flex; align-items:center; padding: 0 8px; }
        .metaGrid .label { font-weight: 800; }
        .metaGrid .span3 { grid-column: span 3; }
        .metaGrid input, .metaGrid select {
          width: 100%; height: calc(var(--rowH) - 6px); border: none; outline: none; font-size: var(--font);
          background: transparent;
        }

        /* Head de tabla */
        .tableHead {
          display: grid;
          grid-template-columns: 110px 1fr 100px repeat(6, 56px) 110px 120px; /* CÓDIGO/ARTÍCULO/A PAGAR + 6 talles + CANT + TOTAL */
          gap: 0; height: var(--rowH); margin-bottom: 0;
        }
        .tableHead .cell {
          border: var(--thin) solid var(--line);
          display:flex; align-items:center; justify-content:center;
          font-weight: 800; font-size: var(--font);
        }
        .center { text-align:center; }
        .right { text-align:right; justify-content: flex-end; }
        .mono { font-variant-numeric: tabular-nums; }

        /* Filas */
        .rows .row {
          display: grid;
          grid-template-columns: 110px 1fr 100px repeat(6, 56px) 110px 120px;
          gap: 0;
          min-height: var(--rowH);
        }
        .rows .cell {
          border: var(--thin) solid var(--line);
          display:flex; align-items:center; padding: 0 8px;
        }
        .rows input {
          width: 100%; height: calc(var(--rowH) - 6px); border: none; outline: none; font-size: var(--font);
          background: transparent; text-align: left;
        }
        .rows input.qty { text-align: center; }

        /* Totales pie */
        .footGrid {
          display: grid;
          grid-template-columns: 110px 1fr 100px repeat(6, 56px) 110px 120px;
          margin-top: 4px;
        }
        .footGrid .cell {
          border: var(--thin) solid var(--line); height: var(--rowH);
          display:flex; align-items:center; padding: 0 8px;
        }
        .footGrid .span9 { grid-column: 1 / span 9; } /* texto al pie ocupa hasta antes de Cant/Total */

        /* Acciones */
        .actions { width: 794px; display:flex; gap: 10px; justify-content: flex-end; }
        .actions button {
          height: 34px; padding: 0 14px; border: 1px solid #d1d5db; background: #fff; border-radius: 8px; cursor: pointer;
        }

        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          .page { padding: 0; }
          .a4.sheet { box-shadow: none; width: 210mm; padding: 6mm; }
        }
      `}</style>
    </div>
  );
}
