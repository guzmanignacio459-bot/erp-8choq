import { cookies } from "next/headers";

import { AccesoFinanzas } from "@/components/8q/pilar-finance-view";
import { accesoValido, secretoConfigurado } from "@/lib/8q/acceso";
import { CostosPreparacion } from "@/components/8q/costos-view";

export const dynamic = "force-dynamic";

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ acceso?: string }>;
}) {
  const params = await searchParams;
  const publicado = Boolean(process.env.VERCEL);
  if (publicado && !secretoConfigurado(process.env.EIGHTQ_DASHBOARD_SECRET)) {
    return <p className="text-sm text-white/70">El acceso del dashboard no está configurado.</p>;
  }
  if (publicado) {
    const jar = await cookies();
    const sesion = jar.get("8q_sesion")?.value ?? null;
    if (!accesoValido(sesion ? decodeURIComponent(sesion) : null, process.env.EIGHTQ_DASHBOARD_SECRET)) {
      return <AccesoFinanzas rechazado={params.acceso === "no"} />;
    }
  }
  return <CostosPreparacion />;
}
