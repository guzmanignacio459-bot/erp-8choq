import { accesoValido } from "@/lib/8q/acceso";
import { importesDelFormulario } from "@/components/8q/costos-view";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.VERCEL) {
    const cookie = request.headers.get("cookie") ?? "";
    const sesion = cookie.split(";").map((parte) => parte.trim()).find((parte) => parte.startsWith("8q_sesion="))?.slice("8q_sesion=".length) ?? null;
    if (!accesoValido(sesion ? decodeURIComponent(sesion) : null, process.env.EIGHTQ_DASHBOARD_SECRET)) {
      return Response.json({ ok: false, error: "no_autorizado" }, { status: 401 });
    }
  }
  const form = await request.formData();
  const importes = importesDelFormulario(form);
  return Response.json({ ok: false, error: "tablas_no_creadas", importes }, { status: 409 });
}
