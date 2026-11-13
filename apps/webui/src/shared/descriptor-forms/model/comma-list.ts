import type { FieldValue } from '@harnesys/contracts';

/** Multi-valued fields store one comma-separated string; these are its only codec. */
export function parseCommaList(value: FieldValue | undefined): string[] {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function serializeCommaList(items: readonly string[]): string {
  const output: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (trimmed.length > 0 && !output.includes(trimmed)) {
      output.push(trimmed);
    }
  }
  return output.join(',');
}
