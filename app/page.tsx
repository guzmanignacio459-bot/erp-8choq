'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import RemitoTabs from './components/RemitoTabs'; // <-- tu ruta real

type TalleKey = 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL';

type Item = {
  codigo: string;
  articulo: string;
  precio: number;        // “A PAGAR” (precio unitario)
  talles: Record<TalleKey, number>;
};

type Cabecera = {
  nombre: string;
  fecha: string;
  dni: string;
  vendedor: string;
  envioMetodo: string;
  metodoPago: string;
  provincia: string;
  envioCosto: number;
  descuento: string; // etiqueta del descuento
  pagado: boolean;
};

const TALLE_KEYS: TalleKey[] = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

function nuevaFila(): Item {
  return {
    codigo: '',
    articulo: '',
    precio: 0,
    talles: { S: 0, M: 0, L: 0, XL: 0, XXL: 0, XXXL: 0 },
  };
}

export default function Page() {
  // ------- ID estable del remito en esta vista -------
  const [remitoId] = useState<string>(() => `R${Date.now().toString(36)}${Math.floor(Math.random() * 1e5).toString(36)}`);

  // ------- Cabecera -------
  const [cab, setCab] = useState<Cabecera>({
    nombre: '',
    fecha: new Date().toISOString().slice(0, 10), // yyyy-mm-dd
    dni: '',
    vendedor: '',
    envioMetodo: '',
    metodoPago: '',
    provincia: 'Mendoza',
    envioCosto: 0,
    descuento: 'Sin descuento',
    pagado: false,
  });

  // ------- Items (tabla) -------
  const [items, setItems] = useState<Item[]>(
    Array.from({ length: 10 }, () => nuevaFila())
  );

  // ------- UI state -------
  const [loading, setLoading] = useState(false);

  // ------- Handlers -------
  const setCabField = <K extends keyof Cabecera>(k: K, v: Cabecera[K]) =>
    setCab((c) => ({ ...c, [k]: v }));

  const setItemField = (row: number, field: keyof Item, value: any) =>
    setItems((prev) => {
      const next = [...prev];
      (next[row] as any)[field] = value;
      return next;
    });

  const setTalle = (row: number, talle: TalleKey, value: number) =>
    setItems((prev) => {
      const next = [...prev];
      next[row] = {
        ...next[row],
        talles: { ...next[row].talles, [talle]: value },
      };
      return next;
    });

  const addRow = () => setItems((arr) => [...arr, nuevaFila()]);
  const removeRow = (row: number) =>
    setItems((arr) => arr.filter((_, i) => i !== row));

  // ------- Cálculos -------
  const cantidadesPorFila = (it: Item) =>
    TALLE_KEYS.reduce((acc, k) => acc + (Number(it.talles[k]) || 0), 0);

  const totalFila = (it: Item) => cantidadesPorFila(it) * (Number(it.precio) || 0);

  const totales = useMemo(() => {
    const totalPrendas = items.reduce((acc, it) => acc + cantidadesPorFila(it), 0);
    const subtotal = items.reduce((acc, it) => acc + totalFila(it), 0);

    // Descuentos más usados (podés ajustar reglas)
    let desc = 0;
    if (cab.descuento === '10%') desc = subtotal * 0.1;
    if (cab.descuento === '15%') desc = subtotal * 0.15;
    if (cab.descuento === '20%') desc = subtotal * 0.2;

    const envio = Number(cab.envioCosto) || 0;
    const total = Math.max(subtotal - desc + envio, 0);

    return { totalPrendas, subtotal, descuento: desc, envio, total };
  }, [items, cab.descuento, cab.envioCosto]);

  // ------- Acciones -------
  const onDownloadPDF = () => {
    window.print();
  };

  const onGuardarSheets = async () => {
    try {
      setLoading(true);

      // validación mínima útil
      const hayFilasConCantidad = items.some((it) => cantidadesPorFila(it) > 0);
      if (!hayFilasConCantidad) {
        alert('⚠️ Agregá al menos una cantidad en talles.');
        setLoading(false);
        return;
      }
      if (!cab.metodoPago) {
        // no es obligatorio para BORRADOR, pero avisa
        console.warn('Método de pago vacío (se guarda como texto vacío en REMITOS / se no imputará en OPERACIONES).');
      }

      const payload = {
        remitoId, // id estable en esta vista
        cabecera: cab,
        items: items.map((it) => ({
          ...it,
          cantidad: cantidadesPorFila(it),
          total: totalFila(it),
        })),
        totales,
      };

      const res = await fetch('/api/remitos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error guardando remito');

      alert(`✅ Remito ${data.remitoId || remitoId} guardado${cab.pagado ? ' y stock actualizado' : ''}`);
    } catch (err: any) {
      console.error(err);
      alert(`❌ No se pudo guardar: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // ------- UI -------
  return (
    <main className="min-h-screen bg-neutral-100 pb-24">
      {/* Tabs de remitos */}
      <RemitoTabs />

      {/* Hoja (lienzo) */}
      <div className="max-w-[1220px] mx-auto p-4">
        <div className="bg-white border-4 border-neutral-700 rounded-md shadow-md print:shadow-none">
          {/* Header con logo + banda superior */}
          <div className="border-b-4 border-neutral-700 p-4 relative h-[80px]">
            <div className="absolute left-6 top-1/2 -translate-y-1/2">
              <Image
                src="/logo-8choq.png"
                alt="8CHOQ"
                width={140}
                height={48}
                className="object-contain"
                priority
              />
            </div>

            <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-4">
              <span className="text-xs text-neutral-500">ID: {remitoId}</span>
              <label className="inline-flex items-center gap-2 select-none">
                <span className="text-sm font-medium">Pagado</span>
                <button
                  type="button"
                  onClick={() => setCabField('pagado', !cab.pagado)}
                  className={`w-11 h-6 rounded-full transition-colors ${
                    cab.pagado ? 'bg-emerald-500' : 'bg-neutral-300'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                      cab.pagado ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          {/* Cabecera */}
          <section className="grid grid-cols-12 gap-0 border-b-4 border-neutral-700">
            {/* 1ª fila */}
            <Cell label="NOMBRE" className="col-span-2" />
            <div className="col-span-4 border border-neutral-700 p-2">
              <input
                value={cab.nombre}
                onChange={(e) => setCabField('nombre', e.target.value)}
                className="w-full outline-none"
                placeholder="Cliente"
              />
            </div>
            <Cell label="ENVÍO" className="col-span-2" />
            <div className="col-span-4 border border-neutral-700 p-2">
              <select
                value={cab.envioMetodo}
                onChange={(e) => setCabField('envioMetodo', e.target.value)}
                className="w-full outline-none bg-white"
              >
                <option value="">Seleccionar...</option>
                <option>Andreani</option>
                <option>Encomienda</option>
                <option>Retiro en local</option>
                <option>Motomensajería</option>
              </select>
            </div>

            {/* 2ª fila */}
            <Cell label="FECHA" className="col-span-2" />
            <div className="col-span-4 border border-neutral-700 p-2">
              <input
                type="date"
                value={cab.fecha}
                onChange={(e) => setCabField('fecha', e.target.value)}
                className="w-full outline-none"
              />
            </div>
            <Cell label="MÉTODO DE PAGO" className="col-span-2" />
            <div className="col-span-4 border border-neutral-700 p-2">
              <select
                value={cab.metodoPago}
                onChange={(e) => setCabField('metodoPago', e.target.value)}
                className="w-full outline-none bg-white"
              >
                <option value="">Seleccionar...</option>
                <option>Mercado Pago</option>
                <option>Transferencia</option>
                <option>Crédito</option>
                <option>Débito</option>
                <option>E-Check</option>
                <option>Efectivo</option>
              </select>
            </div>

            {/* 3ª fila */}
            <Cell label="DNI" className="col-span-2" />
            <div className="col-span-4 border border-neutral-700 p-2">
              <input
                value={cab.dni}
                onChange={(e) => setCabField('dni', e.target.value)}
                className="w-full outline-none"
                placeholder="DNI"
              />
            </div>
            <Cell label="PROVINCIA / LOCALIDAD" className="col-span-2" />
            <div className="col-span-4 border border-neutral-700 p-2">
              <input
                value={cab.provincia}
                onChange={(e) => setCabField('provincia', e.target.value)}
                className="w-full outline-none"
                placeholder="Provincia/Localidad"
              />
            </div>

            {/* 4ª fila */}
            <Cell label="VENDEDOR" className="col-span-2" />
            <div className="col-span-4 border border-neutral-700 p-2">
              <select
                value={cab.vendedor}
                onChange={(e) => setCabField('vendedor', e.target.value)}
                className="w-full outline-none bg-white"
              >
                <option value="">Seleccionar...</option>
                <option>Nacho</option>
                <option>Equipo</option>
              </select>
            </div>
            <Cell label="COSTO DE ENVÍO ($)" className="col-span-2" />
            <div className="col-span-4 border border-neutral-700 p-2">
              <input
                type="number"
                value={cab.envioCosto}
                onChange={(e) => setCabField('envioCosto', Number(e.target.value))}
                className="w-full outline-none"
                placeholder="0"
                min={0}
              />
            </div>

            {/* 5ª fila */}
            <Cell label="DESCUENTO" className="col-span-2" />
            <div className="col-span-10 border border-neutral-700 p-2">
              <select
                value={cab.descuento}
                onChange={(e) => setCabField('descuento', e.target.value)}
                className="w-full outline-none bg-white max-w-[260px]"
              >
                <option>Sin descuento</option>
                <option>10%</option>
                <option>15%</option>
                <option>20%</option>
              </select>
            </div>
          </section>

          {/* Tabla de ítems */}
          <section>
            {/* Header tabla */}
            <div className="grid grid-cols-[130px,1fr,120px,repeat(6,80px),120px,140px] text-sm font-bold text-neutral-800 border-b-2 border-neutral-700">
              <Th>CÓDIGO</Th>
              <Th>ARTÍCULO</Th>
              <Th>A PAGAR</Th>
              {TALLE_KEYS.map((t) => (
                <Th key={t}>{t}</Th>
              ))}
              <Th>CANTIDAD</Th>
              <Th>TOTAL</Th>
            </div>

            {/* Filas */}
            <div className="divide-y-2 divide-neutral-200 border-b-4 border-neutral-700">
              {items.map((it, idx) => {
                const cantidad = cantidadesPorFila(it);
                const total = totalFila(it);
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-[130px,1fr,120px,repeat(6,80px),120px,140px] text-sm"
                  >
                    {/* Código */}
                    <Td>
                      <input
                        value={it.codigo}
                        onChange={(e) => setItemField(idx, 'codigo', e.target.value)}
                        className="w-full outline-none text-neutral-900"
                        placeholder="Código"
                      />
                    </Td>

                    {/* Artículo */}
                    <Td>
                      <input
                        value={it.articulo}
                        onChange={(e) => setItemField(idx, 'articulo', e.target.value)}
                        className="w-full outline-none text-neutral-900"
                        placeholder="Artículo"
                      />
                    </Td>

                    {/* Precio */}
                    <Td>
                      <input
                        type="number"
                        value={it.precio}
                        onChange={(e) =>
                          setItemField(idx, 'precio', Number(e.target.value))
                        }
                        className="w-full outline-none"
                        min={0}
                      />
                    </Td>

                    {/* Talles */}
                    {TALLE_KEYS.map((t) => (
                      <Td key={t}>
                        <input
                          type="number"
                          value={it.talles[t]}
                          onChange={(e) =>
                            setTalle(idx, t, Number(e.target.value || 0))
                          }
                          className="w-full outline-none text-center"
                          min={0}
                        />
                      </Td>
                    ))}

                    {/* Cantidad */}
                    <Td className="text-center font-medium">{cantidad}</Td>

                    {/* Total */}
                    <Td className="text-right font-medium">
                      {currency(total)}
                    </Td>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Totales + Observaciones */}
          <section className="grid grid-cols-12 gap-0">
            {/* Observaciones (libre) */}
            <div className="col-span-8 border-r-4 border-neutral-700 p-6 min-h-[120px]"></div>

            {/* Totales */}
            <div className="col-span-4 text-sm">
              <RowTotal label="TOTAL PRENDAS" value={totales.totalPrendas} />
              <RowTotal label="SUBTOTAL" value={currency(totales.subtotal)} />
              <RowTotal
                label="DESCUENTO"
                value={`-${currency(totales.descuento)}`}
              />
              <RowTotal label="ENVÍO" value={currency(totales.envio)} />
              <RowTotal
                label="TOTAL"
                value={currency(totales.total)}
                strong
                big
              />
            </div>
          </section>

          {/* Acciones */}
          <div className="flex items-center justify-end gap-3 p-4">
            <button
              onClick={addRow}
              className="px-4 py-2 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 active:scale-[.99]"
              disabled={loading}
            >
              + Agregar fila
            </button>

            <button
              onClick={onDownloadPDF}
              className="px-4 py-2 rounded-md border border-neutral-300 bg-white hover:bg-neutral-50"
              disabled={loading}
            >
              Descargar PDF
            </button>

            <button
              onClick={onGuardarSheets}
              className="px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-black disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Guardando...' : 'Guardar en Sheets'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

/* =======================
   Helpers UI
   ======================= */

function Cell({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`border border-neutral-700 px-3 py-2 bg-neutral-100 text-[13px] font-semibold ${className || ''
        }`}
    >
      {label}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-r border-neutral-700 px-2 py-2 bg-neutral-100 text-center">
      {children}
    </div>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border-r border-neutral-200 px-2 py-2 ${className || ''}`}>
      {children}
    </div>
  );
}

function RowTotal({
  label,
  value,
  strong,
  big,
}: {
  label: string;
  value: string | number;
  strong?: boolean;
  big?: boolean;
}) {
  return (
    <div className="grid grid-cols-2">
      <div className="border-t border-neutral-300 px-3 py-2 text-right font-semibold">
        {label}
      </div>
      <div
        className={`border-t border-neutral-300 px-3 py-2 text-right ${strong ? 'font-bold' : ''
          } ${big ? 'text-base' : ''}`}
      >
        {value}
      </div>
    </div>
  );
}

function currency(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}
