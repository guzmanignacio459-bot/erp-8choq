import { NextResponse } from "next/server";
import { getSheets, SPREADSHEET_ID } from "@/lib/googleSheets";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sheets = getSheets();

    const remitosSheet = "REMITOS";
    const stockSheet = "STOCK MAESTRO";

    const { cabecera, items, totales } = body;

    // 🔹 Generar ID único
    const remitoId = `R-${Date.now()}`;

    // 📦 Guardar remito completo en la hoja “REMITOS”
    const remitoRow = [
      remitoId,
      cabecera.fecha,
      cabecera.nombre,
      cabecera.dni,
      cabecera.provincia,
      cabecera.vendedor,
      cabecera.metodoPago,
      totales.totalPrendas,
      totales.subtotal,
      cabecera.envioCosto,
      totales.total,
      cabecera.descuento,
      cabecera.pagado ? "SI" : "NO",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${remitosSheet}!A:L`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [remitoRow] },
    });

    // 📉 Si el remito está marcado como pagado, descontar stock
    if (cabecera.pagado) {
      for (const it of items) {
        const totalTalles = it.talles;

        for (const talle of Object.keys(totalTalles)) {
          const cantidad = Number(totalTalles[talle]);
          if (cantidad <= 0) continue;

          // Buscar el producto por código en la hoja STOCK MAESTRO
          const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${stockSheet}!A:H`,
          });

          const rows = res.data.values || [];
          const rowIndex = rows.findIndex(
            (r: any[]) => r[0]?.toString().trim() === it.codigo.trim()
          );

          if (rowIndex >= 0) {
            const colOffset =
              { S: 1, M: 2, L: 3, XL: 4, XXL: 5, XXXL: 6 }[talle] ?? 0;

            const currentStock = Number(rows[rowIndex][colOffset] || 0);
            const newStock = Math.max(currentStock - cantidad, 0);

            // Actualizar la celda de stock
            const colLetter = String.fromCharCode(65 + colOffset);
            const cell = `${colLetter}${rowIndex + 1}`;

            await sheets.spreadsheets.values.update({
              spreadsheetId: SPREADSHEET_ID,
              range: `${stockSheet}!${cell}`,
              valueInputOption: "USER_ENTERED",
              requestBody: { values: [[newStock]] },
            });
          }
        }
      }
    }

    return NextResponse.json({ ok: true, id: remitoId });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Error al guardar remito" }, { status: 500 });
  }
}
