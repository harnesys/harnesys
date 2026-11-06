export interface Row {
  [column: string]: unknown;
}

export function text(row: Row, column: string): string {
  return String(row[column] ?? '');
}

export function optText(row: Row, column: string): string | null {
  const value = row[column];
  return value === null || value === undefined ? null : String(value);
}

export function num(row: Row, column: string): number {
  return Number(row[column] ?? 0);
}

export function optNum(row: Row, column: string): number | null {
  const value = row[column];
  return value === null || value === undefined ? null : Number(value);
}

export function bool(row: Row, column: string): boolean {
  return num(row, column) !== 0;
}

export function flag(value: boolean): number {
  return value ? 1 : 0;
}

export function json<T>(row: Row, column: string, fallback: T): T {
  const raw = optText(row, column);
  if (raw === null || raw.length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function assign(sets: string[], params: unknown[], column: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  sets.push(`${column} = ?`);
  params.push(value);
}
