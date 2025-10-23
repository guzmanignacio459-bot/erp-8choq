'use client';

import { useEffect, useMemo, useState } from "react";

import RemitoTabs from "../components/RemitoTabs";

type Remito = Record<string, string>;

export default function RemitosPage() {
  const [data, setData] = useState<Remito[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/remitos/list", { cache: "no-store" });
      const json = await res.json();
      setData(json.remitos || []);
    })();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return data;
    return data.filter((r) =>
      Object.values(r).some((v) => (v || "").toLowerCase().includes(t))
    );
  }, [data, q]);

  const keyTotal =
    Object.keys(data[0] || {}).find((k) => k.toLowerCase().includes("total")) ||
    "Total Final";

  return (
    <main className="max-w-[1220px] mx-auto p-4">
    <>
      <RemitoTabs />
      <main className="max-w-[1220px] mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Listado de Remitos</h1>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre, ID, DNI, método..."
        className="border rounded-md px-3 py-2 mb-4 w-full max-w-[420px]"
      />

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
                <td className="px-2 py-2">{r["ID Remito"] || r["ID"] || ""}</td>
                <td className="px-2 py-2">{r["Fecha"] || ""}</td>
                <td className="px-2 py-2">{r["Nombre"] || ""}</td>
                <td className="px-2 py-2">
                  {r["Método De Pago"] || r["Metodo De Pago"] || ""}
                </td>
                <td className="px-2 py-2 text-right">{r[keyTotal] || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
      </main>
    </>
  );
}