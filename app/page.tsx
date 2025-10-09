'use client';
import { useState } from 'react';

export default function Home() {
  const [form, setForm] = useState({
    nombre: '',
    dni: '',
    provincia: '',
    vendedor: '',
    metodoPago: '',
    envio: '',
    articulo: '',
    codigo: '',
    talleS: 0,
    talleM: 0,
    talleL: 0,
    talleXL: 0,
    total: 0,
  });

  const [status, setStatus] = useState('');

  // Helper: número seguro
  const toNum = (v: any) => (v === '' || v === null || v === undefined ? 0 : Number(v));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'number' ? toNum(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('Enviando…');

    const webhook = process.env.NEXT_PUBLIC_REMITOS_WEBHOOK_URL as string;
    if (!webhook) {
      setStatus('⚠️ Falta configurar NEXT_PUBLIC_REMITOS_WEBHOOK_URL en Vercel');
      return;
    }

    try {
      const payload = {
        header: {
          nombre: form.nombre,
          dni: form.dni,
          provinciaLocalidad: form.provincia,
          vendedor: form.vendedor,
          metodoPago: form.metodoPago,
          envio: form.envio,
          costoEnvio: 0,
          detalleGeneral: '',
        },
        items: [
          {
            codigo: form.codigo,
            articulo: form.articulo,
            // 👇 el Apps Script espera "sizes"
            sizes: {
              S: form.talleS,
              M: form.talleM,
              L: form.talleL,
              XL: form.talleXL,
              XXL: 0,
              XXXL: 0,
            },
            precio: 0,
            total: form.total,
          },
        ],
        totals: {
          totalPrendas: form.talleS + form.talleM + form.talleL + form.talleXL,
          subtotal: form.total,
          total: form.total,
        },
      };

      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('HTTP ' + res.status);
      setStatus('✅ Remito enviado correctamente');

      // Reset
      setForm({
        nombre: '',
        dni: '',
        provincia: '',
        vendedor: '',
        metodoPago: '',
        envio: '',
        articulo: '',
        codigo: '',
        talleS: 0, talleM: 0, talleL: 0, talleXL: 0,
        total: 0,
      });
    } catch (err) {
      console.error(err);
      setStatus('❌ Error al enviar. Revisá la URL del webhook y probá de nuevo.');
    }
  };

  return (
    <div style={{ padding: '32px', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', color: '#e5e7eb', background: '#0b0b0b', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 16 }}>📦 Sistema de Remitos 8CHOQ (Prototipo)</h1>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
        <input placeholder="Nombre" name="nombre" value={form.nombre} onChange={handleChange} />
        <input placeholder="DNI" name="dni" value={form.dni} onChange={handleChange} />
        <input placeholder="Provincia / Localidad" name="provincia" value={form.provincia} onChange={handleChange} />
        <input placeholder="Vendedor" name="vendedor" value={form.vendedor} onChange={handleChange} />
        <input placeholder="Método de Pago" name="metodoPago" value={form.metodoPago} onChange={handleChange} />
        <input placeholder="Envío" name="envio" value={form.envio} onChange={handleChange} />

        <hr style={{ borderColor: '#242424', width: '100%', margin: '12px 0' }} />

        <input placeholder="Código (SKU)" name="codigo" value={form.codigo} onChange={handleChange} />
        <input placeholder="Artículo" name="articulo" value={form.articulo} onChange={handleChange} />

        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="S" name="talleS" type="number" value={form.talleS} onChange={handleChange} />
          <input placeholder="M" name="talleM" type="number" value={form.talleM} onChange={handleChange} />
          <input placeholder="L" name="talleL" type="number" value={form.talleL} onChange={handleChange} />
          <input placeholder="XL" name="talleXL" type="number" value={form.talleXL} onChange={handleChange} />
        </div>

        <input placeholder="Total $" name="total" type="number" value={form.total} onChange={handleChange} />

        <button type="submit" style={{ background: '#16a34a', color: '#fff', padding: '10px 14px', borderRadius: 8, fontWeight: 700, border: 0, cursor: 'pointer' }}>
          Marcar como PAGADO y Guardar
        </button>
      </form>

      {status && <p style={{ marginTop: 16, color: '#9ca3af' }}>{status}</p>}
    </div>
  );
}
