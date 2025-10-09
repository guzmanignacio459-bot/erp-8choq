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
type UIEvent = React.ChangeEvent<HTMLInputElement | HTMLSelectElement>;

const onHeader =
  (key: 'nombre'|'fecha'|'dni'|'envio'|'metodoPago'|'provinciaLocalidad'|'vendedor'|'costoEnvio') =>
  (e: UIEvent) => {
    const target = e.target as HTMLInputElement;
    const val = target.type === 'number' ? Number(target.value || 0) : target.value;
    handleHeader(key, val);
  };

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

 type UIEvent = React.ChangeEvent<HTMLInputElement | HTMLSelectElement>;

const onHeader =
  (key: 'nombre'|'fecha'|'dni'|'envio'|'metodoPago'|'provinciaLocalidad'|'vendedor'|'costoEnvio') =>
  (e: UIEvent) => {
    const target = e.target as HTMLInputElement;
    const val =
      target.type === 'number' ? Number(target.value || 0) : target.value;
    handleHeader(key, val);
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
{/* Encabezado espejo planilla */}
<div className="rounded-2xl bg-white shadow p-3 md:p-5 border border-neutral-200">
  <div className="grid grid-cols-12 gap-2">
    <div className="col-span-12 md:col-span-4">
      <Label>NOMBRE</Label>
      <Input value={header.nombre} onChange={onHeader('nombre')} placeholder="Cliente" />
    </div>

    <div className="col-span-12 md:col-span-4 md:col-start-9">
      <Label>ENVÍO</Label>
      <Input value={header.envio} onChange={onHeader('envio')} placeholder="Correo/Retiro" />
    </div>

    <div className="col-span-12 md:col-span-4">
      <Label>FECHA</Label>
      <Input type="date" value={header.fecha} onChange={onHeader('fecha')} />
    </div>

    <div className="col-span-12 md:col-span-4 md:col-start-9">
      <Label>MÉTODO DE PAGO</Label>
      <Select value={header.metodoPago} onChange={onHeader('metodoPago')}>
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
      <Input value={header.dni} onChange={onHeader('dni')} />
    </div>

    <div className="col-span-12 md:col-span-4 md:col-start-9">
      <Label>PROVINCIA / LOCALIDAD</Label>
      <Input value={header.provinciaLocalidad} onChange={onHeader('provinciaLocalidad')} placeholder="Mendoza - Godoy Cruz" />
    </div>

    <div className="col-span-12">
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-12 md:col-span-4">
          <Label>VENDEDOR</Label>
          <Select value={header.vendedor} onChange={onHeader('vendedor')}>
            <option value="">Seleccionar…</option>
            <option>Nacho</option>
            <option>Vendedor 2</option>
            <option>Vendedor 3</option>
          </Select>
        </div>
        <div className="col-span-12 md:col-span-4 md:col-start-9">
          <Label>COSTO DE ENVÍO ($)</Label>
          <Input type="number" value={header.costoEnvio} onChange={onHeader('costoEnvio')} />
        </div>
      </div>
    </div>
  </div>
</div>

       
