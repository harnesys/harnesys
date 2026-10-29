import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FileAccessPolicy } from '../../ports/file-access.ts';
import type { ToolContext } from '../../ports/tools.ts';
import { writeXlsxTool } from './write-xlsx.ts';

const allowAll: FileAccessPolicy = () => ({ decision: 'allow' });

let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'harnesys-write-xlsx-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function ctx(cwd: string): ToolContext {
  return { cwd, paths: { allow: [], threadDir: path.join(cwd, 'thread') }, fileAccess: allowAll };
}

describe('write_xlsx tool', () => {
  test('creates a multi-sheet workbook that reads back with styles applied', async () => {
    const def = writeXlsxTool();
    const target = path.join(root, 'report.xlsx');
    const result = (await def.execute(
      {
        path: target,
        sheets: [
          {
            name: 'Budget',
            rows: [
              ['item', 'qty', 'price'],
              ['coffee', 2, 3.5],
              ['tea', 1, 2.8],
            ],
            columnWidths: [20, 8, 10],
          },
          {
            name: 'Summary',
            rows: [
              ['total', ''],
              ['items', 3],
            ],
            boldHeader: false,
          },
        ],
      },
      ctx(root),
    )) as { bytes: number; sheets: number; created: boolean };
    expect(result.created).toBe(true);
    expect(result.sheets).toBe(2);
    expect(result.bytes).toBeGreaterThan(0);

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(target);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Budget', 'Summary']);
    const budget = workbook.getWorksheet('Budget');
    expect(budget?.getCell('A2').value).toBe('coffee');
    expect(budget?.getCell('B3').value).toBe(1);
    expect(budget?.getRow(1).font?.bold).toBe(true);
    expect(budget?.getColumn(1).width).toBe(20);
    const summary = workbook.getWorksheet('Summary');
    expect(summary?.getRow(1).font?.bold).toBeFalsy();
  });

  test('respects overwrite and rejects empty sheets', async () => {
    const def = writeXlsxTool();
    const target = path.join(root, 'nested', 'book.xlsx');
    const first = (await def.execute(
      { path: target, sheets: [{ name: 'Data', rows: [['a', 1]] }] },
      ctx(root),
    )) as { created: boolean };
    expect(first.created).toBe(true);
    await expect(
      def.execute(
        { path: target, overwrite: false, sheets: [{ name: 'Data', rows: [] }] },
        ctx(root),
      ),
    ).rejects.toThrow('overwrite is false');
    await expect(def.execute({ path: target, sheets: [] }, ctx(root))).rejects.toThrow(
      'At least one sheet',
    );
  });
});
