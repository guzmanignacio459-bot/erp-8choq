import { accesoValido } from "@/lib/8q/acceso";
import { costoVigencia, importesDelFormulario, skusDeLaCarga, type ModalidadCosto } from "@/lib/8q/costos";

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
  const modalidad: ModalidadCosto = form.get("modalidad") === "desglosado" ? "desglosado" : "directo";
  const costo = costoVigencia(modalidad, {
    materiaPrima: importes.materia_prima,
    manoObra: importes.mano_obra,
    avios: importes.avios,
    otros: importes.otros,
    costoUnitario: importes.costo_unitario,
  });
  const skus = skusDeLaCarga(
    String(form.get("sku") ?? ""),
    form.getAll("sku_variante").map(String),
    form.get("conjunto") === "si",
  );
  return Response.json({ ok: false, error: "tablas_no_creadas", modalidad, costo, skus }, { status: 409 });
}
