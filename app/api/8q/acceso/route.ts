import { accesoValido } from "@/lib/8q/acceso";

export async function POST(request: Request) {
  const form = await request.formData();
  const clave = String(form.get("clave") ?? "");
  const secret = process.env.EIGHTQ_DASHBOARD_SECRET;
  if (!accesoValido(clave, secret)) {
    return new Response(null, { status: 303, headers: { location: "/8q/finanzas?acceso=no" } });
  }
  return new Response(null, {
    status: 303,
    headers: {
      location: "/8q/finanzas",
      "set-cookie": `8q_sesion=${encodeURIComponent(clave)}; HttpOnly; Secure; SameSite=Lax; Path=/8q; Max-Age=43200`,
    },
  });
}
