import { NextRequest } from "next/server";
import { getSheets, SPREADSHEET_ID } from "@/lib/googleSheets";

type TalleKey = 'S'|'M'|'L'|'XL'|'XXL'|'XXXL';
const TALLE_KEYS: TalleKey[] = ['S','M','L','XL','XXL','XXXL'];

// === NOMBRES EXACTOS DE TUS HOJAS ===
const SHEET_REM   = "REMITOS";
const SHEET_ITEMS = "REMITO ITEMS";        
const SHEET_STOCK = "STOCK MAESTRO";
const SHEET_OPS   = "PLANILLA DE OPERACIONES";
const SHEET_LOG   = "LOG";                 

// Mapea texto de método de pago -> columna en PLANILLA DE OPERACIONES
const metodoToColIdx: Record<string, number> = {
  "Mercado Pago": 6,
  "Transferencia": 7,
  "Crédito": 8,
  "Credito": 8,
  "Débito": 9,
  "Debito": 9,
  "E-Check": 10,
  "Efectivo": 11
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const cab = body?.cabecera;
    const items = body?.items || [];
    const tot = body?.totales;

    if (!cab || !Array.isArray(items) || items.length === 0)
      return Response.json({ error: "Payload incompleto" }, { status: 400 });

    const remitoId = body?.remitoId || `R${Date.now().toString(36)}`;
    const sheets = getSheets();

    // ========== REMITO (Cabecera)
    const remRow = [[
      remitoId,
      cab.fecha,
      cab.nombre,
      cab.dni,
      cab.provincia,
      cab.vendedor,
      cab.metodoPago,
      tot.totalPrendas,
      tot.subtotal,
      tot.envio,
      tot.total,
      `Desc: ${cab.descuento} | Env: ${cab.envioMetodo} | Estado: ${cab.pagado ? "PAGADO" : "BORRADOR"}`
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_REM}!A:L`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: remRow },
    });

    // ========== ITEMS (detallado)
    const flatItems: any[] = [];
    for (const it of items) {
      for (const t of TALLE_KEYS) {
        const q = Number(it.talles?.[t] || 0);
        if (q > 0) flatItems.push([
          remitoId,
          it.codigo,
          it.articulo,
          t,
          q,
          it.precio,
          q * it.precio
        ]);
      }
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_ITEMS}!A:G`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: flatItems },
    });

    // ========== DESCUENTO DE STOCK (estructura horizontal)
    if (cab.pagado) {
      const stockResp = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_STOCK}!A:H`,
      });

      const stockVals = stockResp.data.values || [];
      const header = stockVals[0];
      const colMap = {
        S: 2, M: 3, L: 4, XL: 5, XXL: 6, XXXL: 7, TOTAL: 8
      };

      // Crear un mapa de artículos
      const index = new Map<string, number>();
      for (let i = 1; i < stockVals.length; i++) {
        const codigo = (stockVals[i][0] || "").trim();
        if (codigo) index.set(codigo, i + 1); // fila real
      }

      const updates: Array<{ range: string; values: any[][] }> = [];
      const errores: string[] = [];

      for (const fi of flatItems) {
        const [_, sku, __, talle, cantidad] = fi;
        const row = index.get(sku);
        if (!row) {
          errores.push(`❌ No existe el artículo ${sku} en STOCK MAESTRO`);
          continue;
        }
        const col = colMap[talle as TalleKey];
        if (!col) continue;

        const celda = `${SHEET_STOCK}!${String.fromCharCode(64 + col)}${row}`;
        const celdaTotal = `${SHEET_STOCK}!H${row}`; // Columna H = Stock Total

        // Leer valor actual
        const valActual = Number(stockVals[row - 1][col - 1] || 0);
        const nuevo = Math.max(valActual - cantidad, 0);

        updates.push({ range: celda, values: [[nuevo]] });

        // Actualizar stock total (B:G sumado)
        const fila = stockVals[row - 1];
        fila[col - 1] = nuevo;
        const total = TALLE_KEYS.reduce((a, k) => a + Number(fila[colMap[k] - 1] || 0), 0);
        updates.push({ range: celdaTotal, values: [[total]] });
      }

      if (errores.length) {
        return Response.json({ error: "Inconsistencias", detalles: errores }, { status: 409 });
      }

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { data: updates, valueInputOption: "RAW" },
      });
    }

    // ========== PLANILLA DE OPERACIONES
    const filaOps = new Array(11).fill("");
    filaOps[0] = cab.fecha;
    filaOps[2] = tot.envio;
    const colIdx = metodoToColIdx[cab.metodoPago] || null;
    if (colIdx) filaOps[colIdx - 1] = tot.total;

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_OPS}!A:K`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [filaOps] },
    });

    // ========== LOG
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_LOG}!A:D`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[remitoId, new Date().toISOString(), cab.pagado ? "REGISTRAR_PAGO" : "BORRADOR", `items=${items.length}`]],
      },
    });

    return Response.json({ ok: true, remitoId });
  } catch (e: any) {
    console.error(e);
    return Response.json({ error: e.message || "Error interno" }, { status: 500 });
  }
}
