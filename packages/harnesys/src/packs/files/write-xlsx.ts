import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Workbook } from 'exceljs';
import { DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import { fileAccessGate, resolveFileTarget } from '../../adapters/actions/file-guard.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import { firstBlockingPattern } from '../../adapters/actions/path-blocklist.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { withPathLock } from './path-lock.ts';

export interface XlsxSheetInput {
  name: string;
  rows: (string | number | boolean | null)[][];
  columnWidths?: number[];
  boldHeader?: boolean;
}

export interface WriteXlsxInput {
  path: string;
  overwrite?: boolean;
  sheets: XlsxSheetInput[];
}

export function writeXlsxTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('write_xlsx', {
    group: 'files',
    description:
      'Create an Excel (.xlsx) workbook with one or more sheets. Each sheet takes a 2D array of rows (strings, numbers, booleans or null); the first row is rendered bold as a header unless boldHeader is false, and optional columnWidths sets column widths in characters. Use for budgets, price lists, reports and any tabular data a human will open in Excel. Paths starting with `thread:` resolve inside the thread file directory.',
    operations: ['fs.write'],
    sideEffect: 'write',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        overwrite: { type: 'boolean' },
        sheets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              rows: { type: 'array', items: { type: 'array' } },
              columnWidths: { type: 'array', items: { type: 'number' } },
              boldHeader: { type: 'boolean' },
            },
            required: ['name', 'rows'],
          },
        },
      },
      required: ['path', 'sheets'],
    },
    gate: fileAccessGate('edit', (input) => (input as { path?: string }).path),
    async execute(input, ctx) {
      const parsed = input as WriteXlsxInput;
      if (parsed.sheets.length === 0) {
        throw new Error('At least one sheet is required.');
      }
      const absolute = resolveFileTarget(ctx, parsed.path, 'edit', options);
      const blocking = firstBlockingPattern(absolute, blocklist);
      if (blocking) {
        throw new Error(`Path is blocked (${blocking}): ${parsed.path}`);
      }
      return withPathLock(absolute, async () => {
        const file = Bun.file(absolute);
        const exists = await file.exists();
        if (exists && parsed.overwrite === false) {
          throw new Error(`File exists and overwrite is false: ${parsed.path}`);
        }
        const ExcelJS = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        for (const sheet of parsed.sheets) {
          appendSheet(workbook, sheet);
        }
        await mkdir(path.dirname(absolute), { recursive: true });
        const buffer = await workbook.xlsx.writeBuffer();
        await Bun.write(absolute, buffer);
        return {
          path: parsed.path,
          bytes: buffer.byteLength,
          sheets: parsed.sheets.length,
          created: !exists,
        };
      });
    },
  });
}

function appendSheet(workbook: Workbook, sheet: XlsxSheetInput): void {
  const worksheet = workbook.addWorksheet(sheet.name);
  worksheet.addRows(sheet.rows);
  if (sheet.boldHeader !== false && sheet.rows.length > 0) {
    const header = worksheet.getRow(1);
    header.font = { bold: true };
    header.commit();
  }
  if (sheet.columnWidths) {
    sheet.columnWidths.forEach((width, i) => {
      worksheet.getColumn(i + 1).width = width;
    });
  }
}
