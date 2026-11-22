import { cookies } from "next/headers";

import { PilarFinanceUnavailable, PilarFinanceView, AccesoFinanzas } from "@/components/8q/pilar-finance-view";
import { accesoValido, secretoConfigurado } from "@/lib/8q/acceso";
import { loadPilarFinance } from "@/lib/8q/pilar-finance-read";

export const dynamic = "force-dynamic";

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; medio?: string; dueno?: string; acceso?: string }>;
}) {
  const params = await searchParams;
  const publicado = Boolean(process.env.VERCEL);
  if (publicado && !secretoConfigurado(process.env.EIGHTQ_DASHBOARD_SECRET)) {
    return (
      <PilarFinanceUnavailable
        reason="El acceso del dashboard no está configurado."
        from={params.from ?? ""}
        to={params.to ?? ""}
        medio={params.medio ?? ""}
      />
    );
  }
  if (publicado) {
    const jar = await cookies();
    const sesion = jar.get("8q_sesion")?.value ?? null;
    if (!accesoValido(sesion ? decodeURIComponent(sesion) : null, process.env.EIGHTQ_DASHBOARD_SECRET)) {
      return <AccesoFinanzas rechazado={params.acceso === "no"} />;
    }
  }
  const loaded = await loadPilarFinance({
    from: params.from,
    to: params.to,
    medio: params.medio,
    dueno: params.dueno,
    acceso: true,
  });

  if (!loaded.ok) {
    return (
      <PilarFinanceUnavailable
        reason={loaded.reason}
        from={loaded.from}
        to={loaded.to}
        medio={loaded.medio}
      />
    );
  }

  return <PilarFinanceView data={loaded.data} />;
}
