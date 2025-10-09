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

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setStatus('Enviando...');
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_REMITOS_WEBHOOK_URL!, {
        method: 'POST',
        body: JSON.stringify({
          header: {
            nombre: form.nombre,
            dni: form.dni,
            provinciaLocalidad: form.provincia,
            vendedor: form.vendedor,
            metodoPago: form.metodoPago,
            envio: form.envio,
          },
          items: [
            {
              codigo: form.codigo,
              articulo: form.articulo,
              talles: {
                S: form.talleS,
                M: form.talleM,
                L: form.talleL,
                XL: form.talleXL,
              },
              total: form.total,
            },
          ],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        setStatus('✅ Remito enviado correctamente');
        setForm({
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
      } else {
        setStatus('❌ Error al enviar el remito');
      }
    } catch (error) {
      console.error(error);
      setStatus('⚠️ Error de conexión');
    }
  };

  return (
    <div style={{ padding: '30px', fontFamily: 'sans-serif', color: '#fff', background: '#111', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>📦 Sistema de Remitos 8CHOQ</h1>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '12px', maxWidth: '600px' }}>
        <input placeholder="Nombre" name="nombre" value={form.nombre} onChange={handleChange} required />
        <input placeholder="DNI" name="dni" value={form.dni} onChange={handleChange} />
        <input placeholder="Provincia / Localidad" name="provincia" value={form.provincia} onChange={handleChange} />
        <input placeholder="Vendedor" name="vendedor" value={form.vendedor} onChange={handleChange} />
        <input placeholder="Método de Pago" name="metodoPago" value={form.metodoPago} onChange={handleChange} />
        <input placeholder="Envío" name="envio" value={form.envio} onChange={handleChange} />

        <hr style={{ margin: '20px 0', borderColor: '#333' }} />

        <input placeholder="Código" name="codigo" value={form.codigo} onChange={handleChange} />
        <input placeholder="Artículo" name="articulo" value={form.articulo} onChange={handleChange} />

        <div style={{ display: 'flex', gap: '8px' }}>
          <input placeholder="S" name="talleS" type="number" value={form.talleS} onChange={handleChange} />
          <input placeholder="M" name="talleM" type="number" value={form.talleM} onChange={handleChange} />
          <input placeholder="L" name="talleL" type="number" value={form.talleL} onChange={handleChange} />
          <input placeholder="
