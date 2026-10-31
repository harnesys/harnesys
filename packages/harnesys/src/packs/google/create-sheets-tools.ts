import { type ToolDefinition, tool } from '../../ports/tools.ts';
import type { GoogleToolsDeps } from './google-tools-deps.ts';

interface SpreadsheetIdInput {
  spreadsheetId: string;
}

interface ReadRangeInput {
  spreadsheetId: string;
  range: string;
}

interface WriteRangeInput {
  spreadsheetId: string;
  range: string;
  rows: string[][];
}

const ROWS_MAX = 1000;

export function createSheetsTools(deps: GoogleToolsDeps): ToolDefinition[] {
  return [
    tool('sheets_list_tabs', {
      group: 'google',
      description:
        'List the tabs of a Google Sheets spreadsheet: tab title, sheet id, row/column counts. Use the tab title to build A1 ranges for the other sheets tools.',
      input: {
        type: 'object',
        properties: { spreadsheetId: { type: 'string' } },
        required: ['spreadsheetId'],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as SpreadsheetIdInput;
          const meta = await deps.google.getSpreadsheetMeta(
            deps.resolveScope(),
            deps.integrationId,
            input.spreadsheetId,
          );
          return { spreadsheetId: meta.spreadsheetId, title: meta.title, tabs: meta.tabs };
        }),
    }),
    tool('sheets_read_range', {
      group: 'google',
      description:
        'Read a range from a Google Sheets spreadsheet as rows of values. range is A1 notation with the tab name, e.g. "Sheet1!A1:D50".',
      input: {
        type: 'object',
        properties: {
          spreadsheetId: { type: 'string' },
          range: { type: 'string', description: 'A1 range, e.g. Sheet1!A1:D50' },
        },
        required: ['spreadsheetId', 'range'],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as ReadRangeInput;
          return await deps.google.readRange(
            deps.resolveScope(),
            deps.integrationId,
            input.spreadsheetId,
            input.range,
          );
        }),
    }),
    tool('sheets_write_range', {
      group: 'google',
      description:
        'Overwrite a range in a Google Sheets spreadsheet with rows of values (A1 notation). Existing values in the range are replaced; USER_ENTERED parsing applies (formulas allowed).',
      input: {
        type: 'object',
        properties: {
          spreadsheetId: { type: 'string' },
          range: { type: 'string', description: 'A1 range, e.g. Sheet1!A1:C3' },
          rows: {
            type: 'array',
            description: 'Rows of cell values',
            items: { type: 'array', items: { type: 'string' } },
            maxItems: ROWS_MAX,
          },
        },
        required: ['spreadsheetId', 'range', 'rows'],
      },
      sideEffect: 'credentialed',
      operations: ['google.write'],
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as WriteRangeInput;
          await deps.google.writeRange(deps.resolveScope(), deps.integrationId, {
            spreadsheetId: input.spreadsheetId,
            range: input.range,
            rows: input.rows,
          });
          return {
            spreadsheetId: input.spreadsheetId,
            range: input.range,
            writtenRows: input.rows.length,
          };
        }),
    }),
    tool('sheets_append_rows', {
      group: 'google',
      description:
        'Append rows to the end of a table in a Google Sheets spreadsheet (INSERT_ROWS). range is A1 notation of the table or a column, e.g. "Sheet1!A:D".',
      input: {
        type: 'object',
        properties: {
          spreadsheetId: { type: 'string' },
          range: { type: 'string', description: 'A1 range of the table, e.g. Sheet1!A:D' },
          rows: {
            type: 'array',
            description: 'Rows of cell values to append',
            items: { type: 'array', items: { type: 'string' } },
            maxItems: ROWS_MAX,
          },
        },
        required: ['spreadsheetId', 'range', 'rows'],
      },
      sideEffect: 'credentialed',
      operations: ['google.write'],
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as WriteRangeInput;
          await deps.google.appendRows(deps.resolveScope(), deps.integrationId, {
            spreadsheetId: input.spreadsheetId,
            range: input.range,
            rows: input.rows,
          });
          return {
            spreadsheetId: input.spreadsheetId,
            range: input.range,
            appendedRows: input.rows.length,
          };
        }),
    }),
  ];
}

async function runGuard<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
