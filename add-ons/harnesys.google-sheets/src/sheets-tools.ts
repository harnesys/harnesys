import { type AddonContext, AddonError, type ToolHandler } from '@harnesys/sdk';
import { sheetsJson, spreadsheetUrl } from './sheets-client.ts';

const ROWS_MAX = 1000;

interface SheetPropertiesWire {
  sheetId?: number;
  title?: string;
  index?: number;
  gridProperties?: { rowCount?: number; columnCount?: number };
}

interface SpreadsheetMetaWire {
  spreadsheetId?: string;
  properties?: { title?: string };
  sheets?: Array<{ properties?: SheetPropertiesWire }>;
}

interface ValuesWire {
  range?: string;
  majorDimension?: string;
  values?: string[][];
}

interface UpdateResultWire {
  updatedRange?: string;
  updatedRows?: number;
  updatedColumns?: number;
  updatedCells?: number;
}

interface AppendResultWire {
  updates?: UpdateResultWire;
}

export interface SheetTab {
  sheetId: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
}

const listTabs: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const spreadsheetId = requiredTextOf(input, 'spreadsheetId');
  const meta = await sheetsJson<SpreadsheetMetaWire>(ctx, {
    ...accountOf(input),
    url: spreadsheetUrl(
      spreadsheetId,
      '?fields=spreadsheetId,properties.title,sheets(properties(sheetId,title,index,gridProperties))',
    ),
  });
  const tabs = (meta.sheets ?? [])
    .map((sheet) => sheet.properties)
    .filter((properties): properties is SheetPropertiesWire => properties !== undefined)
    .map((properties) => ({
      sheetId: properties.sheetId ?? 0,
      title: properties.title ?? '',
      index: properties.index ?? 0,
      rowCount: properties.gridProperties?.rowCount ?? 0,
      columnCount: properties.gridProperties?.columnCount ?? 0,
    }));
  return {
    spreadsheetId,
    title: meta.properties?.title ?? '',
    tabs,
  } satisfies { spreadsheetId: string; title: string; tabs: SheetTab[] };
};

const readRange: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const spreadsheetId = requiredTextOf(input, 'spreadsheetId');
  const range = requiredTextOf(input, 'range');
  const values = await sheetsJson<ValuesWire>(ctx, {
    ...accountOf(input),
    url: spreadsheetUrl(
      spreadsheetId,
      `/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    ),
  });
  return {
    spreadsheetId,
    range: values.range ?? range,
    values: values.values ?? [],
  } satisfies { spreadsheetId: string; range: string; values: string[][] };
};

const writeRange: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const spreadsheetId = requiredTextOf(input, 'spreadsheetId');
  const range = requiredTextOf(input, 'range');
  const rows = rowsOf(input);
  const result = await sheetsJson<UpdateResultWire>(ctx, {
    ...accountOf(input),
    method: 'PUT',
    url: spreadsheetUrl(
      spreadsheetId,
      `/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    ),
    body: JSON.stringify({ range, majorDimension: 'ROWS', values: rows }),
  });
  await ctx.log.info('sheets range written', {
    spreadsheetId,
    range,
    rows: rows.length,
    cells: result.updatedCells ?? 0,
  });
  return {
    spreadsheetId,
    range: result.updatedRange ?? range,
    writtenRows: rows.length,
  } satisfies { spreadsheetId: string; range: string; writtenRows: number };
};

const appendRows: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const spreadsheetId = requiredTextOf(input, 'spreadsheetId');
  const range = requiredTextOf(input, 'range');
  const rows = rowsOf(input);
  const result = await sheetsJson<AppendResultWire>(ctx, {
    ...accountOf(input),
    method: 'POST',
    url: spreadsheetUrl(
      spreadsheetId,
      `/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    ),
    body: JSON.stringify({ majorDimension: 'ROWS', values: rows }),
  });
  await ctx.log.info('sheets rows appended', {
    spreadsheetId,
    range,
    rows: rows.length,
  });
  return {
    spreadsheetId,
    range: result.updates?.updatedRange ?? range,
    appendedRows: rows.length,
  } satisfies { spreadsheetId: string; range: string; appendedRows: number };
};

export const sheetsTools: Record<string, ToolHandler> = {
  list_tabs: listTabs,
  read_range: readRange,
  write_range: writeRange,
  append_rows: appendRows,
};

function rowsOf(input: Record<string, unknown>): string[][] {
  const raw = input.rows;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AddonError('invalid_params', { detail: 'rows must be a non-empty array of rows' });
  }
  if (raw.length > ROWS_MAX) {
    throw new AddonError('invalid_params', { detail: `rows is capped at ${ROWS_MAX} rows` });
  }
  return raw.map((row, index) => {
    if (!Array.isArray(row) || row.some((cell) => typeof cell !== 'string')) {
      throw new AddonError('invalid_params', {
        detail: `row ${index} must be an array of strings`,
      });
    }
    return row as string[];
  });
}

function accountOf(input: Record<string, unknown>): { accountId?: string } {
  const accountId = optionalTextOf(input, 'accountId');
  return accountId === undefined ? {} : { accountId };
}

function requiredTextOf(input: Record<string, unknown>, key: string): string {
  const value = optionalTextOf(input, key);
  if (value === undefined) {
    throw new AddonError('invalid_params', { detail: `${key} is required` });
  }
  return value;
}

function optionalTextOf(input: Record<string, unknown>, key: string): string | undefined {
  const raw = input[key];
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw new AddonError('invalid_params', { detail: `${key} must be a string` });
  }
  return raw === '' ? undefined : raw;
}
