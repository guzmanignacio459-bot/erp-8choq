import { google } from 'googleapis';

export const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID as string;

export function getSheets() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL as string;
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n');

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}
