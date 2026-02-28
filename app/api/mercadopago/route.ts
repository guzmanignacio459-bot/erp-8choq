// app/api/mercadopago/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUILD_MARK = "MP_ROOT__2026_02_15__A1";

function jsonResponse(status: number, body: any) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getImportToken(req: Request) {
  return (req.headers.get("x-import-token") ?? "").trim();
}

function isAuthorized(req: Request) {
  const incoming = getImportToken(req);

  // Si ya usás IMPORT_TOKEN por env en el proyecto, lo toma.
  const expected =
    (process.env.IMPORT_TOKEN ?? "").trim() ||
    "59c2e66c17555371234f0116b6c52351bc6bcc6c077e6033b3a5d24d6688d364";

  return incoming && incoming === expected;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return jsonResponse(401, { ok: false, build: BUILD_MARK, error: "unauthorized" });
  }

  return jsonResponse(200, {
    ok: true,
    build: BUILD_MARK,
    service: "mercadopago",
    routes: [
      "/api/mercadopago/import-payment",
      // futuro:
      // "/api/mercadopago/import-payments-batch"
    ],
  });
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return jsonResponse(401, { ok: false, build: BUILD_MARK, error: "unauthorized" });
  }

  return jsonResponse(400, {
    ok: false,
    build: BUILD_MARK,
    error: "use_a_child_route",
    hint: "Use /api/mercadopago/import-payment",
  });
}
