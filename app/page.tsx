"use client";
import { useState, useMemo } from "react";
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

export default function Remito8CHOQ() {
  const emptyItem = (): Item => ({
    codigo: "TP0214",
    articulo: "Top Roma Blanco",
    aPagar: 0,
    talles: { S: 0, M: 0, L: 0, XL: 0, XXL: 0, XXXL: 0 },
    cantidad: 0,
    total: 0,
    notas: "",
  });

  const [items, setItems] = useState<Item[]>(Array.from({ length: 12 }, () => emptyItem()));
  const [cliente, setCliente] = useState("");
  const [fecha, setFecha] = useState(new Date().toLocaleDateString("es-AR"));
  const [dni, setDni] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [envio, setEnvio] = useState("");
  const [metodoPago, setMetodoPago] = useState("");
  const [provincia, setProvincia] = useState("Mendoza");
  const [costoEnvio, setCostoEnvio] = useState(0);
  const [descuento, setDescuento] = useState(0);

  const vendedores = ["Nacho", "Santi", "Paula", "Malena", "Vendedor 2", "Vendedor 3"];
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
  const metodosPago = ["MP 1 cuota", "MP 3 cuotas", "Transferencia 1", "Transferencia 2"];
  const descuentos = [
    { label: "Sin descuento", value: 0 },
    { label: "Mayorista 5%", value: 5 },
    { label: "Minorista 10%", value: 10 },
  ];

  const addRow = () => setItems((p) => [...p, emptyItem()]);
  const clearTable = () => setItems(Array.from({ length: 12 }, () => emptyItem()));

  const totals = useMemo(() => {
    const totalPrendas = items.reduce((a, i) => a + i.cantidad, 0);
    const subtotal = items.reduce((a, i) => a + i.total, 0);
    const descuentoAplicado = subtotal * (descuento / 100);
    const total = subtotal - descuentoAplicado + costoEnvio;
    return { totalPrendas, subtotal, descuentoAplicado, total };
  }, [items, descuento, costoEnvio]);

  const handleDownloadPDF = async () => {
    const el = document.getElementById("remito-container");
    if (!el) return;

    // imports dinámicos – funcionan solo si las deps están instaladas
    const [jspdfMod, html2canvasMod] = await Promise.all([
      import("jspdf"),
      import("html2canvas"),
    ]);

    const jsPDF = (jspdfMod as any).jsPDF ?? (jspdfMod as any).default;
    const html2canvas = (html2canvasMod as any).default ?? (html2canvasMod as any);

    const canvas = await html2canvas(el, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = 210;
    const imgProps = pdf.getImageProperties(imgData);
    const pdfHeight = (imgProps.height * pageWidth) / imgProps.width;

    pdf.addImage(imgData, "PNG", 0, 0, pageWidth, pdfHeight);
    pdf.save(`Remito-${cliente || "8CHOQ"}.pdf`);
  };

  return (
    <div
      id="remito-container"
      style={{
        fontFamily: "sans-serif",
        maxWidth: "210mm",
        margin: "0 auto",
        padding: "10mm",
        background: "#fff",
        color: "#000",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "15px" }}>
        <Image src={logo8CHOQ} alt="8CHOQ" width={80} height={40} />
        <h1 style={{ fontSize: "18px", fontWeight: "bold" }}>Sistema de Remitos 8CHOQ (Prototipo)</h1>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px",
          border: "1px solid #ddd",
          borderRadius: "10px",
          padding: "15px",
          marginBottom: "20px",
        }}
      >
        {/* Izquierda */}
        <div>
          <label>Nombre</label>
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Cliente" />
          <label>Fecha</label>
          <input value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <label>DNI</label>
          <input value={dni} onChange={(e) => setDni(e.target.value)} />
          <label>Vendedor</label>
          <select value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
            <option value="">Seleccionar...</option>
            {vendedores.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <label>Descuento</label>
          <select value={descuento} onChange={(e) => setDescuento(Number(e.target.value))}>
            {descuentos.map((d) => (
              <option key={d.label} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        {/* Derecha */}
        <div>
          <label>Envío</label>
          <select value={envio} onChange={(e) => setEnvio(e.target.value)}>
            <option value="">Seleccionar...</option>
            {envios.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
          <label>Método de Pago</label>
          <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
            <option value="">Seleccionar...</option>
            {metodosPago.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <label>Provincia / Localidad</label>
          <input value={provincia} onChange={(e) => setProvincia(e.target.value)} />
          <label>Costo de Envío ($)</label>
          <input
            type="number"
            value={costoEnvio}
            onChange={(e) => setCostoEnvio(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Tabla */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "15px" }}>
        <thead>
          <tr style={{ background: "#f4f4f4" }}>
            <th>Código</th>
            <th>Artículo</th>
            <th>A Pagar</th>
            <th>S</th>
            <th>M</th>
            <th>L</th>
            <th>XL</th>
            <th>XXL</th>
            <th>XXXL</th>
            <th>Cantidad</th>
            <th>Total</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td>{item.codigo}</td>
              <td>
                <input
                  value={item.articulo}
                  onChange={(e) =>
                    setItems((prev) => {
                      const updated = [...prev];
                      updated[i].articulo = e.target.value;
                      return updated;
                    })
                  }
                />
              </td>
              <td>
                <input
                  type="number"
                  value={item.aPagar}
                  onChange={(e) =>
                    setItems((prev) => {
                      const updated = [...prev];
                      updated[i].aPagar = Number(e.target.value);
                      updated[i].total = updated[i].cantidad * updated[i].aPagar;
                      return updated;
                    })
                  }
                />
              </td>
              {Object.keys(item.talles).map((talle) => (
                <td key={talle}>
                  <input
                    type="number"
                    value={item.talles[talle]}
                    onChange={(e) =>
                      setItems((prev) => {
                        const updated = [...prev];
                        updated[i].talles[talle] = Number(e.target.value);
                        updated[i].cantidad = Object.values(updated[i].talles).reduce(
                          (a, b) => a + b,
                          0
                        );
                        updated[i].total = updated[i].cantidad * updated[i].aPagar;
                        return updated;
                      })
                    }
                  />
                </td>
              ))}
              <td>{item.cantidad}</td>
              <td>${item.total}</td>
              <td>
                <input
                  value={item.notas}
                  onChange={(e) =>
                    setItems((prev) => {
                      const updated = [...prev];
                      updated[i].notas = e.target.value;
                      return updated;
                    })
                  }
                  placeholder="Notas"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totales */}
      <div style={{ textAlign: "right", marginTop: "20px" }}>
        <p>Total Prendas: {totals.totalPrendas}</p>
        <p>Subtotal: ${totals.subtotal.toFixed(2)}</p>
        <p>Descuento: -${totals.descuentoAplicado.toFixed(2)}</p>
        <p>Envío: ${costoEnvio}</p>
        <h3>Total: ${totals.total.toFixed(2)}</h3>
      </div>

      {/* Botones */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px" }}>
        <button onClick={clearTable} style={{ background: "#ccc" }}>
          Limpiar
        </button>
        <button onClick={addRow} style={{ background: "#ddd" }}>
          + Agregar fila
        </button>
        <button onClick={handleDownloadPDF} style={{ background: "#4CAF50", color: "#fff" }}>
          📄 Descargar PDF
        </button>
      </div>
    </div>
  );
}
