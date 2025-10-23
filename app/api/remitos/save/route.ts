import { NextResponse } from "next/server";

import { getSheets, SPREADSHEET_ID } from "@/lib/googleSheets";

type RemitoItem = {
  codigo?: string;
  articulo?: string;
  precio?: number;
  cantTotal?: number;
  totalLinea?: number;
  talles?: Record<string, number>;
};

type RemitoPayload = {
  remitoId: string;
  fecha?: string;
  mayorista?: boolean;
  cliente?: {
    nombre?: string;
    dni?: string;
    provincia?: string;
    localidad?: string;
  };
  vendedor?: string;
  pago?: { metodo?: string };
  items: RemitoItem[];
  subtotal?: number;
  descuentos?: number;
  envioTotal?: number;
  total?: number;
  observaciones?: string;
  nombreHoja?: string;
  pagado?: boolean;
};

const REMITOS_RANGE = "REMITOS!A:L";
const OPERACIONES_RANGE = "Planilla de Operaciones!A:E";

function safeNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const normalized = value.replace(/,/g, ".");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function sumPrendas(items: RemitoItem[]) {
  return items.reduce((acc, item) => acc + safeNumber(item.cantTotal), 0);
}

function sanitizeRemito(remito: RemitoPayload) {
  const items = remito.items || [];
  const subtotal = remito.subtotal ?? items.reduce((acc, item) => acc + safeNumber(item.totalLinea), 0);
  const descuentos = safeNumber(remito.descuentos);
  const envioTotal = safeNumber(remito.envioTotal);
  const total = remito.total ?? subtotal - descuentos + envioTotal;

  return {
    ...remito,
    subtotal,
    descuentos,
    envioTotal,
    total,
    items,
  };
}

function buildRemitoRow(remito: ReturnType<typeof sanitizeRemito>) {
  const { cliente } = remito;
  const provincia = cliente?.provincia ?? "";
  const localidad = cliente?.localidad ?? "";
  const localidadProvincia = [provincia, localidad].filter(Boolean).join(" / ");

  return [
    remito.remitoId,
    remito.fecha ?? "",
    cliente?.nombre ?? "",
    cliente?.dni ?? "",
    localidadProvincia,
    remito.vendedor ?? "",
    remito.pago?.metodo ?? "",
    sumPrendas(remito.items),
    remito.subtotal,
    remito.envioTotal,
    remito.total,
    remito.descuentos,
  ];
}

function normalizeMethod(method?: string) {
  if (!method) return "";
  const noAccents = method.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return noAccents.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").toUpperCase();
}

function getFeeForMethod(method?: string) {
  const normalized = normalizeMethod(method);
  if (!normalized) return 0;
  const envKey = `OPS_FEE_${normalized}`;
  const raw = process.env[envKey];
  if (!raw) return 0;
  const parsed = safeNumber(raw, 0);
  return parsed;
}

function buildOperacionRow(remito: ReturnType<typeof sanitizeRemito>) {
  const bruto = safeNumber(remito.total);
  const fee = getFeeForMethod(remito.pago?.metodo);
  const retencion = Number(((bruto * fee) / 100).toFixed(2));
  const neto = Number((bruto - retencion).toFixed(2));

  return {
    bruto,
    retencion,
    neto,
    metodo: remito.pago?.metodo ?? "",
    vendedor: remito.vendedor ?? "",
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const remitoInput = body?.remito as RemitoPayload | undefined;

    if (!remitoInput?.remitoId) {
      return NextResponse.json(
        { error: "Remito inválido" },
        { status: 400 }
      );
    }

    const remito = sanitizeRemito(remitoInput);

    const sheets = getSheets();

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: REMITOS_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [buildRemitoRow(remito)],
      },
    });

    const operacion = buildOperacionRow(remito);
    let operationsSaved = false;

    if (operacion.bruto || operacion.metodo || operacion.vendedor) {
      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: OPERACIONES_RANGE,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[
              operacion.bruto,
              operacion.retencion,
              operacion.neto,
              operacion.metodo,
              operacion.vendedor,
            ]],
          },
        });
        operationsSaved = true;
      } catch (opsError) {
        console.error("No se pudo guardar Planilla de Operaciones", opsError);
      }
    }

    return NextResponse.json({ ok: true, operationsSaved, operacion });
  } catch (error: unknown) {
    console.error("Error guardando remito", error);
    const message =
      error instanceof Error ? error.message : "Error guardando remito";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}