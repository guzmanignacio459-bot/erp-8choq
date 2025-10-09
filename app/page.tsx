// 8CHOQ Remitos – Prototipo Vercel (Next.js + Tailwind)
// Versión: layout espejo de tu planilla (captura)
// -----------------------------------------------------
// Colocá este archivo como `app/page.tsx` (App Router) o `pages/index.tsx` (Pages Router).
// Requiere Tailwind. Usa variable de entorno:
//   NEXT_PUBLIC_REMITOS_WEBHOOK_URL -> URL de tu Apps Script Web App
//
'use client';
import React, { useMemo, useState } from 'react';

const WEBHOOK_URL = process.env.NEXT_PUBLIC_REMITOS_WEBHOOK_URL || '';

type SizeKey = 'S'|'M'|'L'|'XL'|'XXL'|'XXXL';
const SIZE_KEYS: SizeKey[] = ['S','M','L','XL','XXL','XXXL'];

export default function RemitosApp() {
  const [header, setHeader] = useState({
    nombre: '',
    fecha: new Date().toISOString().slice(0,10),
    dni: '',
    envio: '',
    metodoPago: '',
    provinciaLocalidad: '',
    vendedor: '',
    costoEnvio: 0,
  });

  type Item = {
    id: string;
    codigo: string;
    articulo: string;
    precio: number; // A PAGAR unitario
    sizes: Record<SizeKey, number>;
    cantidad: number; // suma de talles
    total: number; // cantidad * precio
    detalle?: string;
  };

  const makeEmptyItem = (): Item => ({
    id: crypto.randomUUID(),
    codigo: '',
    articulo: '',
    precio: 0,
    sizes: { S:0, M:0, L:0, XL:0, XXL:0, XXXL:0 },
    cantidad: 0,
    total: 0,
    detalle: '',
  });

  const [items, setItems] = useState<Item[]>(Array.from({length:12},()=>makeEmptyItem()));

  const totals = useMemo(() => {
    const totalPrendas = items.reduce((acc, it) => acc + it.cantidad, 0);
    const subtotal = items.reduce((acc, it) => acc + it.total, 0);
    const envio = Number(header.costoEnvio||0);
    const total = subtotal + envio;
    return { totalPrendas, subtotal, envio, total };
  }, [items, header.costoEnvio]);

  const handleHeader = (k: keyof typeof header, v: any) => setHeader(p => ({...p, [k]: v}));

  const normalizeItem = (it: Item) => {
    const cantidad = SIZE_KEYS.reduce((acc, s) => acc + (Number(it.sizes[s])||0), 0);
    const total = cantidad * (Number(it.precio)||0);
    return { ...it, cantidad, total };
  };

  const updateItem = (id: string, up: (x: Item)=>Item) => setItems(prev => prev.map(i => i.id===id ? normalizeItem(up({...i})) : i));

  const addRow = () => setItems(p => [...p, makeEmptyItem()]);
  const clearTable = () => setItems(Array.from({length:12},()=>makeEmptyItem()));

  const onSubmit = async () => {
    if (!WEBHOOK_URL) return alert('⚠️ Falta configurar NEXT_PUBLIC_REMITOS_WEBHOOK_URL en Vercel');
    if (!header.nombre) return alert('Completá NOMBRE.');

    const payload = {
      header,
      items: items.filter(i => i.codigo || i.articulo || i.cantidad>0),
      totals: { totalPrendas: totals.totalPrendas, subtotal: totals.subtotal, total: totals.total },
      createdAt: new Date().toISOString(),
      source: '8choq-remitos-vercel',
    };

    try {
      const res = await fetch(WEBHOOK_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json().catch(()=>({ok:true}));
      alert('Remito enviado ✅'+(data?.remitoId?`
ID: ${data.remitoId}`:''));
      clearTable();
    } catch (e:any) {
      console.error(e); alert('❌ No se pudo enviar. Revisá el Webhook y probá de nuevo.');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 p-3 md:p-6 print:p-0">
      <div className="mx-auto max-w-7xl">
        {/* Encabezado espejo planilla */}
        <div className="rounded-2xl bg-white shadow p-3 md:p-5 border border-neutral-200">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-12 md:col-span-4">
              <Label>NOMBRE</Label>
              <Input value={header.nombre} onChange={e=>handleHeader('nombre', e.target.value)} placeholder="Cliente"/>
            </div>
            <div className="col-span-12 md:col-span-4 md:col-start-9">
              <Label>ENVÍO</Label>
              <Input value={header.envio} onChange={e=>handleHeader('envio', e.target.value)} placeholder="Correo/Retiro"/>
            </div>

            <div className="col-span-12 md:col-span-4">
              <Label>FECHA</Label>
              <Input type="date" value={header.fecha} onChange={e=>handleHeader('fecha', e.target.value)} />
            </div>
            <div className="col-span-12 md:col-span-4 md:col-start-9">
              <Label>MÉTODO DE PAGO</Label>
              <Select value={header.metodoPago} onChange={e=>handleHeader('metodoPago', e.target.value)}>
                <option value="">Seleccionar…</option>
                <option>MP 3 Cuotas</option>
                <option>Transferencia</option>
                <option>Débito MP</option>
                <option>Efectivo</option>
                <option>Crédito</option>
              </Select>
            </div>

            <div className="col-span-12 md:col-span-4">
              <Label>DNI</Label>
              <Input value={header.dni} onChange={e=>handleHeader('dni', e.target.value)} />
            </div>
            <div className="col-span-12 md:col-span-4 md:col-start-9">
              <Label>PROVINCIA / LOCALIDAD</Label>
              <Input value={header.provinciaLocalidad} onChange={e=>handleHeader('provinciaLocalidad', e.target.value)} placeholder="Mendoza - Godoy Cruz"/>
            </div>

            <div className="col-span-12">
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 md:col-span-4">
                  <Label>VENDEDOR</Label>
                  <Select value={header.vendedor} onChange={e=>handleHeader('vendedor', e.target.value)}>
                    <option value="">Seleccionar…</option>
                    <option>Nacho</option>
                    <option>Vendedor 2</option>
                    <option>Vendedor 3</option>
                  </Select>
                </div>
                <div className="col-span-12 md:col-span-4 md:col-start-9">
                  <Label>COSTO DE ENVÍO ($)</Label>
                  <Input type="number" value={header.costoEnvio} onChange={e=>handleHeader('costoEnvio', Number(e.target.value))}/>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabla espejo */}
        <div className="mt-4 rounded-2xl bg-white shadow border border-neutral-200 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-100 text-neutral-700">
                <Th className="w-[9%]">CODIGO</Th>
                <Th className="w-[20%]">ARTICULO</Th>
                <Th className="w-[8%] text-right">A PAGAR</Th>
                {SIZE_KEYS.map(s => <Th key={s} className="text-right w-[5%]">{s}</Th>)}
                <Th className="w-[7%] text-right">CANTIDAD</Th>
                <Th className="w-[10%] text-right">TOTAL</Th>
                <Th className="w-[16%]">DETALLE</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id} className="border-b last:border-b-0">
                  <Td><input className="cell" value={it.codigo} onChange={e=>updateItem(it.id, x=>({ ...x, codigo: e.target.value }))} placeholder="TP0214"/></Td>
                  <Td><input className="cell" value={it.articulo} onChange={e=>updateItem(it.id, x=>({ ...x, articulo: e.target.value }))} placeholder="Top Roma Blanco"/></Td>
                  <Td><input type="number" className="cell text-right" value={it.precio} onChange={e=>updateItem(it.id, x=>({ ...x, precio: Number(e.target.value) }))}/></Td>
                  {SIZE_KEYS.map(s => (
                    <Td key={s}><input type="number" min={0} className="cell text-right w-16" value={it.sizes[s]} onChange={e=>updateItem(it.id, x=>({ ...x, sizes: { ...x.sizes, [s]: Number(e.target.value) } }))}/></Td>
                  ))}
                  <Td className="text-right tabular-nums">{it.cantidad}</Td>
                  <Td className="text-right tabular-nums font-semibold">${it.total.toLocaleString('es-AR')}</Td>
                  <Td><input className="cell" value={it.detalle} onChange={e=>updateItem(it.id, x=>({ ...x, detalle: e.target.value }))} placeholder="Notas"/></Td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between p-3">
            <button onClick={addRow} className="btn">+ Agregar fila</button>
            <button onClick={clearTable} className="btn-secondary">Limpiar</button>
          </div>
        </div>

        {/* Totales espejo */}
        <div className="mt-3 grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-8"></div>
          <div className="col-span-12 md:col-span-4">
            <div className="rounded-2xl bg-white shadow border border-neutral-200 p-3">
              <Row label="TOTAL PRENDAS" value={totals.totalPrendas.toString()} />
              <Row label="SUBTOTAL" value={`$${totals.subtotal.toLocaleString('es-AR')}`} />
              <Row label="ENVÍO" value={`$${totals.envio.toLocaleString('es-AR')}`} />
              <Row label="TOTAL" value={`$${totals.total.toLocaleString('es-AR')}`} strong />
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="mt-4 flex flex-col md:flex-row gap-3 justify-end">
          <button onClick={onSubmit} className="btn-primary">Marcar como PAGADO y Guardar</button>
          <button onClick={()=>window.print()} className="btn-secondary">Imprimir / PDF</button>
        </div>

        <footer className="text-center text-xs text-neutral-500 mt-6 mb-2">8CHOQ · Remitos · {new Date().getFullYear()}</footer>
      </div>

      <style jsx global>{`
        .input { @apply w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/10; }
        .cell { @apply w-full rounded-lg border border-neutral-200 bg-white px-2 py-1 outline-none focus:ring-2 focus:ring-black/10; }
        .btn { @apply rounded-xl bg-neutral-900 text-white px-4 py-2 shadow hover:bg-neutral-800; }
        .btn-secondary { @apply rounded-xl bg-neutral-100 text-neutral-800 px-4 py-2 hover:bg-neutral-200; }
        .btn-primary { @apply rounded-xl bg-black text-white px-5 py-2.5 shadow hover:bg-neutral-800 text-sm font-semibold; }
        table th, table td { @apply px-2 py-2; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .btn, .btn-primary, .btn-secondary { display:none; } .shadow{box-shadow:none;} }
      `}</style>
    </div>
  );
}

function Label({children}:{children:React.ReactNode}){ return <div className="text-[11px] font-semibold tracking-wide text-neutral-600 mb-0.5">{children}</div>; }
function Input(props:any){ return <input {...props} className={`input ${props.className||''}`} />; }
function Select(props:any){ return <select {...props} className={`input ${props.className||''}`} />; }
function Th({ children, className='' }: { children: React.ReactNode; className?: string }) { return <th className={`text-left font-semibold text-xs md:text-sm tracking-wide ${className}`}>{children}</th>; }
function Td({ children, className='' }: { children: React.ReactNode; className?: string }) { return <td className={`align-middle ${className}`}>{children}</td>; }
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) { return (
  <div className="flex items-center justify-between border-b border-neutral-200 py-2 last:border-b-0">
    <span className="text-sm text-neutral-600">{label}</span>
    <span className={`tabular-nums ${strong ? 'text-xl font-bold' : 'font-medium'}`}>{value}</span>
  </div>
); }
