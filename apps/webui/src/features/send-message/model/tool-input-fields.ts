import type { DiffDetail } from '@/shared/lib/tool-code';

export type ToolInputPreview =
  | {
      kind: 'code';
      language?: string;
      text: string;
    }
  | {
      kind: 'markdown';
      text: string;
    }
  | {
      kind: 'diff';
      detail: DiffDetail;
    }
  | {
      kind: 'text';
      text: string;
    };

export interface ToolInputSummary {
  title: string;
  lines: Array<{
    label: string;
    value: string;
  }>;
  preview?: ToolInputPreview;
}

export type SummaryBuilder = (title: string, fields: Record<string, unknown>) => ToolInputSummary;

export function strField(fields: Record<string, unknown>, key: string): string {
  const value = fields[key];
  return typeof value === 'string' ? value : '';
}

export function optField(fields: Record<string, unknown>, key: string): string | undefined {
  const value = fields[key];
  return typeof value === 'string' ? value : undefined;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function linesSummary(keys: string[]): SummaryBuilder {
  return (title, fields) => ({ title, lines: linePairs(fields, keys) });
}

export function linePairs(
  fields: Record<string, unknown>,
  keys: string[],
): Array<{
  label: string;
  value: string;
}> {
  const lines: Array<{
    label: string;
    value: string;
  }> = [];
  for (const key of keys) {
    const value = fields[key];
    if (value === undefined || value === null || value === '') {
      continue;
    }
    lines.push({ label: key, value: truncate(stringifyValue(value), 160) });
  }
  return lines;
}

export function shellModeLines(fields: Record<string, unknown>): Array<{
  label: string;
  value: string;
}> {
  const lines: Array<{
    label: string;
    value: string;
  }> = [];
  if (fields.run_in_background === true || fields.block_until_ms === 0) {
    lines.push({ label: 'background', value: 'true' });
  }
  if (fields.open_in_terminal === true) {
    lines.push({ label: 'terminal', value: 'true' });
  }
  return lines;
}

export function looksJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

export function prettyJson(text: string): string | undefined {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return undefined;
  }
}

export function stringifyValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}
