export type CsvColumnKind = 'number' | 'date' | 'text';

export interface CsvTable {
  header: string[];
  rows: string[][];
  columnKinds: CsvColumnKind[];
  delimiter: string;
  truncated: boolean;
}

export interface CsvSort {
  column: number;
  direction: 'asc' | 'desc';
}

const DELIMITER_CANDIDATES = [',', ';', '\t', '|'];
const MAX_PARSE_ROWS = 100_000;
const TYPE_SAMPLE_ROWS = 1_000;
const NUMBER_RE = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export function detectDelimiter(text: string): string {
  const newline = text.indexOf('\n');
  const line = newline === -1 ? text : text.slice(0, newline);
  const outsideQuotes = line.replace(/"(?:[^"]|"")*"/g, '');
  let best = ',';
  let bestCount = 0;
  for (const candidate of DELIMITER_CANDIDATES) {
    const count = outsideQuotes.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(text: string, delimiter?: string): CsvTable {
  const sep = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let truncated = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      const quoted = readQuoted(text, i, field);
      field = quoted.field;
      inQuotes = quoted.open;
      i = quoted.end;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === sep) {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
      row.push(field);
      field = '';
      if (appendRow(rows, row)) {
        truncated = true;
        break;
      }
      row = [];
      continue;
    }
    field += ch;
  }
  if (!truncated && (field !== '' || row.length > 0)) {
    row.push(field);
    rows.push(row);
  }
  const headerRow = rows.shift() ?? [];
  const header = headerRow.map((cell, i) => (cell === '' ? `Column ${i + 1}` : cell));
  const width = Math.max(header.length, 1);
  const normalized = rows.map((r) => normalizeRow(r, width));
  return {
    header,
    rows: normalized,
    columnKinds: header.map((_, i) => inferColumnKind(normalized, i)),
    delimiter: sep,
    truncated,
  };
}

function readQuoted(
  text: string,
  i: number,
  field: string,
): { end: number; field: string; open: boolean } {
  const ch = text[i];
  if (ch !== '"') {
    return { end: i, field: field + ch, open: true };
  }
  if (text[i + 1] === '"') {
    return { end: i + 1, field: `${field}"`, open: true };
  }
  return { end: i, field, open: false };
}

function appendRow(rows: string[][], row: string[]): boolean {
  if (row.length === 1 && row[0] === '') {
    return false;
  }
  rows.push(row);
  return rows.length >= MAX_PARSE_ROWS;
}

function normalizeRow(row: string[], width: number): string[] {
  if (row.length === width) {
    return row;
  }
  if (row.length > width) {
    return row.slice(0, width);
  }
  return [...row, ...Array<string>(width - row.length).fill('')];
}

function inferColumnKind(rows: string[][], column: number): CsvColumnKind {
  let sawValue = false;
  let sawNonNumber = false;
  let sawNonDate = false;
  const limit = Math.min(rows.length, TYPE_SAMPLE_ROWS);
  for (let i = 0; i < limit; i++) {
    const cell = rows[i][column];
    if (cell === '') {
      continue;
    }
    sawValue = true;
    if (!NUMBER_RE.test(cell)) {
      sawNonNumber = true;
    }
    if (!ISO_DATE_RE.test(cell)) {
      sawNonDate = true;
    }
    if (sawNonNumber && sawNonDate) {
      return 'text';
    }
  }
  if (!sawValue) {
    return 'text';
  }
  if (!sawNonDate) {
    return 'date';
  }
  return 'number';
}

export function compareCsvCells(a: string, b: string, kind: CsvColumnKind): number {
  if (a === '' && b === '') {
    return 0;
  }
  if (a === '') {
    return 1;
  }
  if (b === '') {
    return -1;
  }
  if (kind === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      return na - nb;
    }
  }
  return a.localeCompare(b);
}

export function sortCsvRows(rows: string[][], sort: CsvSort, kinds: CsvColumnKind[]): string[][] {
  const kind = kinds[sort.column] ?? 'text';
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort(
    (a, b) => compareCsvCells(a[sort.column] ?? '', b[sort.column] ?? '', kind) * factor,
  );
}
