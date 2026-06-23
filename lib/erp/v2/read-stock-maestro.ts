import { google } from "googleapis";

import {
  STOCK_MAESTRO_META_COLUMNS,
  STOCK_MAESTRO_SHEET_NAME,
  STOCK_MAESTRO_SIZE_COLUMNS,
} from "@/lib/erp/v2/stock-maestro-constants";

export type StockMaestroRow = {
  rowIndex: number;
  sku: string;
  articulo: string;
  sizes: Record<string, number>;
  stockTotal: number | null;
  raw: Record<string, string>;
};

export type ReadStockMaestroResult = {
  sheetName: string;
  headers: string[];
  sourceRows: StockMaestroRow[];
  fetchedAt: string;
};

function parseQty(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

function normalizeHeaders(headerRow: string[]): string[] {
  return headerRow.map((h) => String(h ?? "").trim());
}

function normalizeRecord(headers: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((header, index) => {
    if (!header) return;
    record[header] = row[index] ?? "";
  });
  return record;
}

export function parseStockMaestroProducts(
  products: Record<string, string>[],
  opts?: { rowOffset?: number }
): StockMaestroRow[] {
  const rowOffset = opts?.rowOffset ?? 2;
  const rows: StockMaestroRow[] = [];

  for (let i = 0; i < products.length; i++) {
    const raw = products[i];
    const sku = String(raw.SKU ?? "").trim().toUpperCase();
    const articulo = String(raw.ARTICULO ?? raw.Articulo ?? "").trim();
    const sizes: Record<string, number> = {};

    for (const talle of STOCK_MAESTRO_SIZE_COLUMNS) {
      sizes[talle] = parseQty(raw[talle]);
    }

    const stockTotalRaw = raw["Stock Total"];
    const stockTotal =
      stockTotalRaw === undefined || stockTotalRaw === ""
        ? null
        : parseQty(stockTotalRaw);

    rows.push({
      rowIndex: rowOffset + i,
      sku,
      articulo,
      sizes,
      stockTotal: Number.isNaN(stockTotal as number) ? null : stockTotal,
      raw,
    });
  }

  return rows;
}

export async function readStockMaestroFromSheets(opts?: {
  spreadsheetId?: string;
}): Promise<ReadStockMaestroResult> {
  const spreadsheetId =
    opts?.spreadsheetId ??
    process.env.GOOGLE_SPREADSHEET_ID ??
    process.env.GOOGLE_SHEETS_STOCK_ID ??
    process.env.GOOGLE_SHEETS_OPERATIONS_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").replace(
    /\\n/g,
    "\n"
  );

  if (!spreadsheetId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing spreadsheet id (GOOGLE_SPREADSHEET_ID or GOOGLE_SHEETS_STOCK_ID) / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_KEY"
    );
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${STOCK_MAESTRO_SHEET_NAME}!A:Z`,
  });

  const values = response.data.values ?? [];
  if (!values.length) {
    return {
      sheetName: STOCK_MAESTRO_SHEET_NAME,
      headers: [],
      sourceRows: [],
      fetchedAt: new Date().toISOString(),
    };
  }

  const [headerRow, ...dataRows] = values;
  const headers = normalizeHeaders(headerRow.map((h) => String(h ?? "")));
  const products = dataRows.map((row) =>
    normalizeRecord(headers, row.map((c) => String(c ?? "")))
  );

  return {
    sheetName: STOCK_MAESTRO_SHEET_NAME,
    headers,
    sourceRows: parseStockMaestroProducts(products),
    fetchedAt: new Date().toISOString(),
  };
}

export function auditStockMaestroHeaders(headers: string[]): {
  presentMeta: string[];
  missingMeta: string[];
  presentSizes: string[];
  missingSizes: string[];
  unknownColumns: string[];
} {
  const headerSet = new Set(headers.filter(Boolean));
  const known = new Set<string>([
    ...STOCK_MAESTRO_META_COLUMNS,
    ...STOCK_MAESTRO_SIZE_COLUMNS,
  ]);

  return {
    presentMeta: STOCK_MAESTRO_META_COLUMNS.filter((c) => headerSet.has(c)),
    missingMeta: STOCK_MAESTRO_META_COLUMNS.filter((c) => !headerSet.has(c)),
    presentSizes: STOCK_MAESTRO_SIZE_COLUMNS.filter((c) => headerSet.has(c)),
    missingSizes: STOCK_MAESTRO_SIZE_COLUMNS.filter((c) => !headerSet.has(c)),
    unknownColumns: headers.filter((h) => h && !known.has(h)),
  };
}
