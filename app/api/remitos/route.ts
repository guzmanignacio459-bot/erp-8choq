import { NextResponse } from "next/server";
import { google } from "googleapis";
import dayjs from "dayjs";

export const runtime = "nodejs";

// === Tipos esperados desde tu formulario ===
type Talles = Partial<Record<"S" | "M" | "L" | "XL" | "XXL" | "XXXL", number>>;

type Item = {
  codigo: string; // ej: "remera-dry-fit-brownie"
  articulo: string; // nombre para planilla
  precio: number; // precio unitario
  cantTotal: number; // cantidad total (suma de los talles)
  totalLinea: number; // precio * cantTotal (con descuentos si aplica)
  talles?: Talles; // { S: 1, M: 0, ... }
};

type Remito = {
  remitoId: string; // ej: "R-000123"
  fecha: string; // yyyy-mm-dd
  mayorista: boolean; // true = Mayorista, false = Minorista
  cliente: { nombre: string; dni?: string; provincia?: string; localidad?: string };
  vendedor: string;
  envio: { metodo: string; costo: number };
  pago: { metodo: string };
  items: Item[];
  subtotal: number;
  descuentos?: number;
  envioTotal?: number;
  total: number;
  observaciones?: string;
  nombreHoja?: string; // columna "Nombre De La Hoja"
};

// === Cliente de Google Sheets ===
function sheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

// === Helpers ===
const COLS_STOCK = { A_CODIGO: 0, B_S: 1, C_M: 2, D_L: 3, E_XL: 4, F_XXL: 5, G_XXXL: 6 };
const ORDEN_TALLES: (keyof Talles)[] = ["S", "M", "L", "XL", "XXL", "XXXL"];

function distribucionesPorMedioPago(metodo: Remito["pago"]["metodo"], total: number) {
  const base = { mp: 0, transf: 0, credito: 0, debito: 0, echeck: 0, efectivo: 0 };
  if (metodo === "Mercado Pago") base.mp = total;
  else if (metodo === "Transferencia") base.transf = total;
  else if (metodo === "Credito") base.credito = total;
  else if (metodo === "Debito") base.debito = total;
  else if (metodo === "E-Check") base.echeck = total;
  else if (metodo === "Efectivo") base.efectivo = total;
  return base;
}

// === Endpoint GET de prueba de conexión ===
export async function GET() {
  try {
    const sheets = sheetsClient();
    const res = await sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_OPERATIONS_ID!,
    });

    return NextResponse.json({
      ok: true,
      message: "✅ Conectado correctamente a Google Sheets",
      title: res.data.properties?.title,
    });
  } catch (err: any) {
    console.error("Error en GET /api/remitos:", err);
    return NextResponse.json({ ok: false, error: err.message ?? String(err) }, { status: 500 });
  }
}
