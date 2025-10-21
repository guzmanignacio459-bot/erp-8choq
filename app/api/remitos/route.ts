import { NextResponse } from "next/server";
import { getSheets, SPREADSHEET_ID } from "@/lib/googleSheets";

export async function GET() {
  try {
    const sheets = getSheets();
    const sheet = "REMITOS"; // pestaña

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheet}!A:L`, // ID, Fecha, Nombre, DNI, Prov/Loc, Vendedor, Método, TotalPrendas, Subtotal, Envío, Total, Descuento/Pagado
    });

    const rows = res.data.values ?? [];
    const headers = rows[0] ?? [];
    const data = rows.slice(1).map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h: string, i: number) => (obj[h] = r[i] ?? ""));
      return obj;
    });

    return NextResponse.json({ remitos: data });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
