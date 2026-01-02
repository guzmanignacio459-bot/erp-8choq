'use client';

import { useEffect, useMemo, useState } from 'react';

type Remito = Record<string, string>;

export default function ListadoRemitos() {
  const [data, setData] = useState<Remito[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch('/api/remitos/list', { cache: 'no-store' });
        // Si tu route devuelve { ok, data, error }, normalizamos:
        const json = await res.json();
        const remitos = Array.isArray(json?.remitos)
          ? json.remitos
          : Array.isArray(json?.data)
          ? json.data
          : [];
        setData(remitos);
      } catch (e: any) {
        setErr(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return data;
    return data.filter((r) =>
      Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(t))
    );
  }, [data, q]);

  const keyTotal =
    Object.keys(data[0] || {}).find((k) => k.toLowerCase().includes('total')) ||
    'Total Final';

  if (loading) return <div className="p-4">Cargando remitos…</div>;
  if (err) return <div className="p-4 text-red-600">Error: {err}</div>;
  if (filtered.length === 0)
    return (
      <div className="p-4">
        <div className="mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, ID, DNI, método…"
            className="border rounded-md px-3 py-2 w-full max-w-[420px]"
          />
        </div>
        <div>No hay remitos para mostrar.</div>
      </div>
    );

  return (
    <div className="p-4">
      <div className="mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, ID, DNI, método…"
          className="border rounded-md px-3 py-2 w-full max-w-[420px]"
        />
      </div>

      <div className="overflow-auto border rounded-md">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-neutral-100 border-b">
            <tr>
              <th className="px-2 py-2 text-left">ID Remito</th>
              <th className="px-2 py-2 text-left">Fecha</th>
              <th className="px-2 py-2 text-left">Cliente</th>
              <th className="px-2 py-2 text-left">Método de Pago</th>
              <th className="px-2 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="px-2 py-2">{r['ID Remito'] || r['ID'] || ''}</td>
                <td className="px-2 py-2">{r['Fecha'] || ''}</td>
                <td className="px-2 py-2">{r['Nombre'] || r['Cliente'] || ''}</td>
                <td className="px-2 py-2">
                  {r['Método De Pago'] || r['Metodo De Pago'] || r['Pago'] || ''}
                </td>
                <td className="px-2 py-2 text-right">{r[keyTotal] || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
