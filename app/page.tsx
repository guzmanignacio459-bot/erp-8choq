'use client';
import React, {useMemo, useState} from 'react';

type SizeKey = 'S'|'M'|'L'|'XL'|'XXL'|'XXXL';
const SIZE_KEYS: SizeKey[] = ['S','M','L','XL','XXL','XXXL'];
const WEBHOOK = process.env.NEXT_PUBLIC_REMITOS_WEBHOOK_URL || '';

type DescuentoTipo = '' | 'mayorista' | 'minorista';

type Header = {
  nombre: string;
  fecha: string;
  dni: string;
  envio: string;                 // opción seleccionada
  metodoPago: string;            // opción seleccionada
  provinciaLocalidad: string;
  vendedor: string;              // opción seleccionada
  costoEnvio: number;
  descuentoTipo: DescuentoTipo;  // '', 'mayorista', 'minorista'
};

type Item = {
  id: string;
  codigo: string;
  articulo: string;
  precio: number;              // “A PAGAR” unitario
  sizes: Record<SizeKey, number>;
  cantidad: number;            // suma de talles
  total: number;               // cantidad * precio
  detalle?: string;
};

const emptyItem = (): Item => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()),
  codigo: '',
  articulo: '',
  precio: 0,
  sizes: {S:0,M:0,L:0,XL:0,XXL:0,XXXL:0},
  cantidad: 0,
  total: 0,
  detalle: '',
});

export default function Page() {
  const [header, setHeader] = useState<Header>({
    nombre: '',
    fecha: new Date().toISOString().slice(0,10),
    dni: '',
    envio: '',
    metodoPago: '',
    provinciaLocalidad: '',
    vendedor: '',
    costoEnvio: 0,
    descuentoTipo: '',
  });

  const [items, setItems] = useState<Item[]>(Array.from({length: 12}, emptyItem));

  const handleHeader = (k: keyof Header, v: string | number) =>
    setHeader(h => ({...h, [k]: v as any}));

  type UIEvent = React.ChangeEvent<HTMLInputElement | HTMLSelectElement>;
  const onHeader = (key: keyof Header) => (e: UIEvent) => {
    const t = e.target as HTMLInputElement;
    const val = t.type === 'number' ? Number(t.value || 0) : t.value;
    handleHeader(key, val);
  };

  const normalizeItem = (it: Item): Item => {
    const cantidad = SIZE_KEYS.reduce((acc, s) => acc + (Number(it.sizes[s]) || 0), 0);
    const total = cantidad * (Number(it.precio) || 0);
    return {...it, cantidad, total};
  };

  const updateItem = (id: string, up: (x: Item)=>Item) =>
    setItems(prev => prev.map(i => (i.id === id ? normalizeItem(up({...i})) : i)));

  const addRow = () => setItems(p => [...p, emptyItem()]);
  const clearTable = () => setItems(Array.from({length:12}, emptyItem));

  const totals = useMemo(() => {
    const totalPrendas = items.reduce((a,i)=>a+i.cantidad,0);
    const subtotal = items.reduce((a,i)=>a+i.total,0);
    const envio = Number(header.costoEnvio || 0);
    const descuento =
      header.descuentoTipo === 'mayorista' ? subtotal * 0.05 :
      header.descuentoTipo === 'minorista' ? subtotal * 0.10 : 0;
    const total = subtotal - descuento + envio;
    return {totalPrendas, subtotal, descuento, envio, total};
  }, [items, header.costoEnvio, header.descuentoTipo]);

  const onSubmit = async () => {
    if (!WEBHOOK) return alert('⚠️ Configurá NEXT_PUBLIC_REMITOS_WEBHOOK_URL en Vercel');
    if (!header.nombre) return alert('Completá NOMBRE');

    const payload = {
      header,
      items: items.filter(i => i.codigo || i.articulo || i.cantidad>0),
      totals: {
        totalPrendas: totals.totalPrendas,
        subtotal: totals.subtotal,
        descuento: totals.descuento,
        envio: totals.envio,
        total: totals.total
      },
      createdAt: new Date().toISOString(),
      source: '8choq-remitos-vercel',
    };

    try {
      const res = await fetch(WEBHOOK, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      alert('✅ Remito enviado');
      clearTable();
    } catch (e) {
      console.error(e);
      alert('❌ No se pudo enviar. Revisá el webhook.');
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.h1}>📦 Sistema de Remitos 8CHOQ (Prototipo)</h1>

        {/* Encabezado */}
        <div style={styles.card}>
          <div style={styles.grid12}>
            <div style={styles.col4}>
              <Label>NOMBRE</Label>
              <Input value={header.nombre} onChange={onHeader('nombre')} placeholder="Cliente" />
            </div>
            <div style={{...styles.col4, ...styles.colStart9}}>
              <Label>ENVÍO</Label>
              <Select value={header.envio} onChange={onHeader('envio')}>
                <option value="">Seleccionar…</option>
                <option>Correo - Sucursal</option>
                <option>Correo - Domicilio</option>
                <option>Andreani - Sucursal</option>
                <option>Andreani - Domicilio</option>
                <option>OCA</option>
                <option>Send Box</option>
                <option>Retira</option>
                <option>Domicilio</option>
              </Select>
            </div>

            <div style={styles.col4}>
              <Label>FECHA</Label>
              <Input type="date" value={header.fecha} onChange={onHeader('fecha')} />
            </div>
            <div style={{...styles.col4, ...styles.colStart9}}>
              <Label>MÉTODO DE PAGO</Label>
              <Select value={header.metodoPago} onChange={onHeader('metodoPago')}>
                <option value="">Seleccionar…</option>
                <option>MP 1 Cuota</option>
                <option>MP 3 Cuotas</option>
                <option>Transferencia</option>
                <option>Transferencia 2</option>
                <option>Débito MP</option>
                <option>Efectivo</option>
                <option>Crédito</option>
              </Select>
            </div>

            <div style={styles.col4}>
              <Label>DNI</Label>
              <Input value={header.dni} onChange={onHeader('dni')} />
            </div>
            <div style={{...styles.col4, ...styles.colStart9}}>
              <Label>PROVINCIA / LOCALIDAD</Label>
              <Input value={header.provinciaLocalidad} onChange={onHeader('provinciaLocalidad')} placeholder="Mendoza - Godoy Cruz" />
            </div>

            <div style={styles.col4}>
              <Label>VENDEDOR</Label>
              <Select value={header.vendedor} onChange={onHeader('vendedor')}>
                <option value="">Seleccionar…</option>
                <option>Nacho</option>
                <option>Santi</option>
                <option>Paula</option>
                <option>Malena</option>
                <option>Vendedor 2</option>
                <option>Vendedor 3</option>
              </Select>
            </div>
            <div style={{...styles.col4, ...styles.colStart9}}>
              <Label>COSTO DE ENVÍO ($)</Label>
              <Input type="number" value={header.costoEnvio} onChange={onHeader('costoEnvio')} />
            </div>

            <div style={styles.col4}>
              <Label>DESCUENTO</Label>
              <Select value={header.descuentoTipo} onChange={onHeader('descuentoTipo')}>
                <option value="">Sin descuento</option>
                <option value="mayorista">Mayorista (5%)</option>
                <option value="minorista">Minorista (10%)</option>
              </Select>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div style={{...styles.card, marginTop:12, overflow:'auto'}}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.theadRow}>
                <Th style={{width:'9%'}}>CODIGO</Th>
                <Th style={{width:'20%'}}>ARTICULO</Th>
                <Th style={{width:'8%', textAlign:'right'}}>A PAGAR</Th>
                {SIZE_KEYS.map(s=> <Th key={s} style={{textAlign:'right', width:'6%'}}>{s}</Th>)}
                <Th style={{width:'7%', textAlign:'right'}}>CANTIDAD</Th>
                <Th style={{width:'10%', textAlign:'right'}}>TOTAL</Th>
                <Th style={{width:'16%'}}>DETALLE</Th>
              </tr>
            </thead>
            <tbody>
              {items.map(it=>(
                <tr key={it.id} style={styles.tr}>
                  <Td><Input value={it.codigo} onChange={(e)=>updateItem(it.id, x=>({...x, codigo:e.target.value}))} placeholder="TP0214" /></Td>
                  <Td><Input value={it.articulo} onChange={(e)=>updateItem(it.id, x=>({...x, articulo:e.target.value}))} placeholder="Top Roma Blanco" /></Td>
                  <Td><Input type="number" value={it.precio} onChange={(e)=>updateItem(it.id, x=>({...x, precio:Number(e.target.value||0)}))} /></Td>
                  {SIZE_KEYS.map(s=>(
                    <Td key={s}><Input type="number" value={it.sizes[s]}
                      onChange={(e)=>updateItem(it.id, x=>({...x, sizes:{...x.sizes, [s]: Number((e.target as HTMLInputElement).value||0)}}))} /></Td>
                  ))}
                  <Td style={{textAlign:'right'}}>{it.cantidad}</Td>
                  <Td style={{textAlign:'right', fontWeight:700}}>${it.total.toLocaleString('es-AR')}</Td>
                  <Td><Input value={it.detalle||''} onChange={(e)=>updateItem(it.id, x=>({...x, detalle:e.target.value}))} placeholder="Notas" /></Td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={styles.tableActions}>
            <button onClick={addRow} style={btn}>+ Agregar fila</button>
            <button onClick={clearTable} style={btnSecondary}>Limpiar</button>
          </div>
        </div>

        {/* Totales */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(12,1fr)', gap:12, marginTop:12}}>
          <div style={{gridColumn:'span 8'}} />
          <div style={{gridColumn:'span 4'}}>
            <div style={styles.card}>
              <Row label="TOTAL PRENDAS" value={String(totals.totalPrendas)} />
              <Row label="SUBTOTAL" value={`$${totals.subtotal.toLocaleString('es-AR')}`} />
              <Row label="DESCUENTO" value={`-$${totals.descuento.toLocaleString('es-AR')}`} />
              <Row label="ENVÍO" value={`$${totals.envio.toLocaleString('es-AR')}`} />
              <Row label="TOTAL" value={`$${totals.total.toLocaleString('es-AR')}`} strong />
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div style={{display:'flex', gap:12, justifyContent:'flex-end', marginTop:16}}>
          <button onClick={onSubmit} style={btnPrimary}>Marcar como PAGADO y Guardar</button>
          <button onClick={()=>window.print()} style={btnSecondary}>Imprimir / PDF</button>
        </div>

        <footer style={{textAlign:'center', fontSize:12, color:'#666', marginTop:18}}>
          8CHOQ · Remitos · {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}

/* ---------- UI helpers & styles (sin Tailwind) ---------- */
const styles = {
  page: {background:'#fff', minHeight:'100vh', color:'#111', fontFamily:'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'} as React.CSSProperties,
  container: {maxWidth:1120, margin:'0 auto', padding:'28px 16px'} as React.CSSProperties,
  h1: {fontSize:24, fontWeight:800, marginBottom:12} as React.CSSProperties,
  card: {background:'#fafafa', border:'1px solid #ddd', borderRadius:16, padding:12} as React.CSSProperties,
  grid12: {display:'grid', gridTemplateColumns:'repeat(12,1fr)', gap:8} as React.CSSProperties,
  col4: {gridColumn:'span 4'} as React.CSSProperties,
  colStart9: {gridColumnStart:9 as any},
  table: {width:'100%', fontSize:14, borderCollapse:'separate' as const, borderSpacing:0} as React.CSSProperties,
  theadRow: {background:'#f1f5f9', color:'#334155'} as React.CSSProperties,
  tr: {borderBottom:'1px solid #e5e7eb'} as React.CSSProperties,
  tableActions: {display:'flex', justifyContent:'space-between', padding:12} as React.CSSProperties,
};

const baseInput: React.CSSProperties = { width:'100%', background:'#fff', color:'#111', border:'1px solid #d1d5db', borderRadius:10, padding:'8px 10px', outline:'none' };
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{...baseInput, ...(props.style||{})}} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{...baseInput, ...(props.style||{})}} />;
}
function Label({children}:{children:React.ReactNode}) {
  return <div style={{fontSize:11, fontWeight:700, color:'#475569', marginBottom:4}}>{children}</div>;
}
function Th({children, style}:{children:React.ReactNode; style?:React.CSSProperties}) {
  return <th style={{padding:'10px 8px', borderBottom:'1px solid #e5e7eb', ...style}}>{children}</th>;
}
function Td({children, style}:{children:React.ReactNode; style?:React.CSSProperties}) {
  return <td style={{padding:'6px 8px', verticalAlign:'middle', ...style}}>{children}</td>;
}
function Row({label, value, strong}:{label:string; value:string; strong?:boolean}) {
  return (
    <div style={{display:'flex', justifyContent:'space-between', borderBottom:'1px solid #e5e7eb', padding:'8px 0'}}>
      <span style={{color:'#64748b'}}>{label}</span>
      <span style={{fontWeight: strong ? 800 : 600, fontSize: strong ? 18 : 14}}>{value}</span>
    </div>
  );
}
const btn: React.CSSProperties = {background:'#111827', color:'#fff', padding:'8px 12px', borderRadius:10, border:'0'};
const btnSecondary: React.CSSProperties = {background:'#e5e7eb', color:'#111', padding:'8px 12px', borderRadius:10, border:'0'};
const btnPrimary: React.CSSProperties = {background:'#16a34a', color:'#fff', padding:'10px 14px', borderRadius:10, border:'0', fontWeight:800};

