import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
export const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!;

export function getSheets() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!.replace(/\\n/g, "\n");
  const auth = new google.auth.JWT({ email, key, scopes: SCOPES });
  return google.sheets({ version: "v4", auth });
}
