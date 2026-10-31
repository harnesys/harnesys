import type {
  GoogleSheetsAppendInput,
  GoogleSheetsMeta,
  GoogleSheetsRange,
  GoogleSheetsTab,
  GoogleSheetsWriteInput,
} from 'harnesys';
import { asGoogleRecord, googleApiJson, stringField } from './google-http.ts';

const SHEETS_API_BASE = '/sheets/v4/spreadsheets';

export async function getSpreadsheetMeta(
  token: string,
  spreadsheetId: string,
): Promise<GoogleSheetsMeta> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'GET',
    path: `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}`,
    query: new URLSearchParams({
      fields: 'properties.title,sheets.properties(sheetId,title,gridProperties)',
    }),
  });
  const properties = asGoogleRecord(res.properties);
  const sheets = Array.isArray(res.sheets) ? res.sheets.map(asGoogleRecord) : [];
  const tabs: GoogleSheetsTab[] = sheets.map((sheet) => {
    const sheetProps = asGoogleRecord(sheet.properties);
    const grid = asGoogleRecord(sheetProps.gridProperties);
    return {
      sheetId: numberOrNull(sheetProps.sheetId),
      title: stringField(sheetProps, 'title') ?? '',
      rowCount: numberOrNull(grid.rowCount ?? grid.frozenRowCount),
      columnCount: numberOrNull(grid.columnCount),
    };
  });
  return {
    spreadsheetId,
    title: stringField(properties, 'title') ?? '',
    tabs,
  };
}

export async function readRange(
  token: string,
  spreadsheetId: string,
  range: string,
): Promise<GoogleSheetsRange> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'GET',
    path: `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    query: new URLSearchParams({ valueRenderOption: 'FORMATTED_VALUE', majorDimension: 'ROWS' }),
  });
  const values = Array.isArray(res.values) ? res.values : [];
  return {
    range: stringField(res, 'range') ?? range,
    rows: values
      .filter(Array.isArray)
      .map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : String(cell)))),
  };
}

export async function writeRange(token: string, input: GoogleSheetsWriteInput): Promise<void> {
  await googleApiJson<Record<string, unknown>>({
    token,
    method: 'PUT',
    path: `${SHEETS_API_BASE}/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}`,
    query: new URLSearchParams({ valueInputOption: 'USER_ENTERED' }),
    body: { values: input.rows },
  });
}

export async function appendRows(token: string, input: GoogleSheetsAppendInput): Promise<void> {
  await googleApiJson<Record<string, unknown>>({
    token,
    method: 'POST',
    path: `${SHEETS_API_BASE}/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}:append`,
    query: new URLSearchParams({
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
    }),
    body: { values: input.rows },
  });
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
