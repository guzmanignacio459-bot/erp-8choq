import { NextResponse } from "next/server";

import { getSheets, SPREADSHEET_ID } from "@/lib/googleSheets";

const SHEET_NAME = "STOCK MAESTRO";

function normalizeRow(headers: string[], row: string[]) {
  const record: Record<string, string> = {};
  headers.forEach((header, index) => {
    if (!header) return;
    record[header] = row[index] ?? "";
  });
  return record;
}

export async function GET() {
  try {
    const sheets = getSheets();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:Z`,
    });

    const rows = response.data.values ?? [];
    if (!rows.length) {
      return NextResponse.json({ products: [] });
    }

    const [headerRow, ...dataRows] = rows;
    const headers = headerRow.map((header) => header.trim());

    const products = dataRows.map((row) => normalizeRow(headers, row));

    return NextResponse.json({ products });
  } catch (error: unknown) {
    console.error("Failed to fetch stock", error);
    const message =
      error instanceof Error ? error.message : "Error leyendo STOCK MAESTRO";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}