import type { CodeLine, DiffDetail } from '@/shared/lib/tool-code';

export type { CodeLine, DiffDetail, DiffHunk, DiffHunkLine } from '@/shared/lib/tool-code';
export { detectLanguage } from '@/shared/lib/tool-code';
export interface FileDetail {
  type: 'file';
  path: string;
  language?: string;
  totalLines?: number;
  truncated?: boolean;
  lines: CodeLine[];
  rawContent: string;
}
export interface ListEntryItem {
  name: string;
  type: 'file' | 'dir';
  size?: number;
}
export interface EntriesDetail {
  type: 'entries';
  path?: string;
  pattern?: string;
  truncated?: boolean;
  items: ListEntryItem[];
}
export interface GrepMatchItem {
  file: string;
  line: number;
  text: string;
}
export interface GrepDetail {
  type: 'grep';
  pattern: string;
  matches: GrepMatchItem[];
  truncated?: boolean;
}
export interface TerminalDetail {
  type: 'terminal';
  command: string;
  stdout: string;
  stderr: string;
  exitCode?: number;
  durationMs?: number;
}
export interface HttpDetail {
  type: 'http';
  url: string;
  method: string;
  status: number;
  ok: boolean;
  statusText?: string;
  headers?: Record<string, string>;
  body: string;
  durationMs?: number;
}
export interface GenericDetail {
  type: 'generic';
  title: string;
  language?: string;
  text: string;
  lines: CodeLine[];
}
export type ToolDetail =
  | DiffDetail
  | FileDetail
  | EntriesDetail
  | GrepDetail
  | TerminalDetail
  | HttpDetail
  | GenericDetail;
export function toolMeta(detail: ToolDetail): string[] {
  switch (detail.type) {
    case 'terminal':
      return detail.exitCode !== undefined ? [`exit ${detail.exitCode}`] : [];
    case 'http':
      return [detail.method, httpStatus(detail)];
    case 'file':
      return withTruncated(
        countLabel(detail.totalLines ?? detail.lines.length, 'line'),
        detail.truncated,
      );
    case 'diff':
      return diffMeta(detail);
    case 'entries':
      return withTruncated(countLabel(detail.items.length, 'item'), detail.truncated);
    case 'grep':
      return withTruncated(countLabel(detail.matches.length, 'hit'), detail.truncated);
    case 'generic': {
      const n = detail.lines.length;
      return n > 0 ? [countLabel(n, 'line')] : [];
    }
  }
}

function httpStatus(detail: Extract<ToolDetail, { type: 'http' }>): string {
  return detail.statusText ? `${detail.status} ${detail.statusText}` : String(detail.status);
}

function countLabel(n: number, unit: string): string {
  return `${n} ${n === 1 ? unit : `${unit}s`}`;
}

function withTruncated(label: string, truncated: boolean | undefined): string[] {
  return truncated ? [`${label} · truncated`] : [label];
}

function diffMeta(detail: Extract<ToolDetail, { type: 'diff' }>): string[] {
  const parts: string[] = [];
  if (detail.replacements != null) {
    parts.push(
      `${detail.replacements} ${detail.replacements === 1 ? 'replacement' : 'replacements'}`,
    );
  }
  parts.push(`+${detail.addedCount}`, `-${detail.deletedCount}`);
  return parts;
}
