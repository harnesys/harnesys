import { type DiffDetail, detectLanguage, diffFromEdit } from '@/shared/lib/tool-code';
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
export function summarizeToolInput(name: string, raw: string | undefined): ToolInputSummary {
  const title = toolTitle(name);
  const fields = parseFields(raw);
  if (!fields) {
    return {
      title,
      lines: [],
      preview: raw?.trim() ? { kind: 'text', text: raw.trim() } : undefined,
    };
  }
  const builder = SUMMARY_BUILDERS[name];
  if (builder) {
    return builder(title, fields);
  }
  return defaultSummary(title, fields);
}

type SummaryBuilder = (title: string, fields: Record<string, unknown>) => ToolInputSummary;

const SUMMARY_BUILDERS: Record<string, SummaryBuilder> = {
  write_file: writeSummary,
  edit_file: editSummary,
  read_file: linesSummary(['path', 'offset', 'limit']),
  list_dir: linesSummary(['path', 'depth']),
  glob: linesSummary(['pattern', 'path']),
  grep: linesSummary(['pattern', 'path', 'glob']),
  shell: shellSummary,
  process_poll: linesSummary(['job_id', 'since', 'wait_ms']),
  process_kill: linesSummary(['job_id']),
  http: fetchSummary,
  fetch: fetchSummary,
  agents_spawn: spawnSummary,
};

function strField(fields: Record<string, unknown>, key: string): string {
  const value = fields[key];
  return typeof value === 'string' ? value : '';
}

function optField(fields: Record<string, unknown>, key: string): string | undefined {
  const value = fields[key];
  return typeof value === 'string' ? value : undefined;
}

function linesSummary(keys: string[]): SummaryBuilder {
  return (title, fields) => ({ title, lines: linePairs(fields, keys) });
}

function writeSummary(title: string, fields: Record<string, unknown>): ToolInputSummary {
  return {
    title,
    lines: linePairs(fields, ['path']),
    preview: contentPreview(strField(fields, 'path'), strField(fields, 'content')),
  };
}

function editSummary(title: string, fields: Record<string, unknown>): ToolInputSummary {
  const path = strField(fields, 'path');
  const oldText = strField(fields, 'old_string');
  const newText = strField(fields, 'new_string');
  if (oldText || newText) {
    return {
      title,
      lines: linePairs(fields, ['path']),
      preview: { kind: 'diff', detail: diffFromEdit(path, oldText, newText) },
    };
  }
  const content = strField(fields, 'content');
  return {
    title,
    lines: linePairs(fields, ['path']),
    preview: content ? contentPreview(path, content) : undefined,
  };
}

function shellSummary(title: string, fields: Record<string, unknown>): ToolInputSummary {
  const command = strField(fields, 'command');
  return {
    title,
    lines: [...linePairs(fields, ['cwd']), ...shellModeLines(fields)],
    preview: command ? { kind: 'code', language: 'bash', text: command } : undefined,
  };
}

function fetchSummary(title: string, fields: Record<string, unknown>): ToolInputSummary {
  const body = optField(fields, 'body');
  return {
    title,
    lines: [
      ...linePairs(fields, ['method']),
      ...(typeof fields.url === 'string' ? [{ label: 'url', value: fields.url }] : []),
    ],
    preview: body
      ? {
          kind: 'code',
          language: looksJson(body) ? 'json' : undefined,
          text: prettyJson(body) ?? body,
        }
      : undefined,
  };
}

function spawnSummary(title: string, fields: Record<string, unknown>): ToolInputSummary {
  const calls = Array.isArray(fields.calls) ? fields.calls : [];
  const lines: Array<{ label: string; value: string }> = [];
  const tasks: string[] = [];
  for (const call of calls) {
    const rec = call !== null && typeof call === 'object' ? (call as Record<string, unknown>) : {};
    if (typeof rec.agentId === 'string' && rec.agentId) {
      lines.push({ label: 'agent', value: rec.agentId });
    }
    const task = spawnTaskOf(rec.input);
    if (task) {
      tasks.push(task);
    }
  }
  return {
    title,
    lines,
    preview:
      tasks.length > 0 ? { kind: 'text', text: truncate(tasks.join('\n\n'), 200) } : undefined,
  };
}

function spawnTaskOf(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }
  const messages = (value as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) {
    return '';
  }
  for (const message of messages) {
    const rec =
      message !== null && typeof message === 'object' ? (message as Record<string, unknown>) : {};
    if (typeof rec.content === 'string' && rec.content.trim()) {
      return rec.content.trim();
    }
  }
  return '';
}

function defaultSummary(title: string, fields: Record<string, unknown>): ToolInputSummary {
  return {
    title,
    lines: Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== '')
      .slice(0, 8)
      .map(([label, value]) => ({
        label,
        value: truncate(stringifyValue(value), 120),
      })),
  };
}
function contentPreview(path: string, content: string): ToolInputPreview | undefined {
  if (!content) {
    return undefined;
  }
  if (detectLanguage(path) === 'markdown') {
    return { kind: 'markdown', text: content };
  }
  return {
    kind: 'code',
    language: detectLanguage(path),
    text: content,
  };
}
function toolTitle(name: string): string {
  switch (name) {
    case 'write_file':
      return 'Write File';
    case 'edit_file':
      return 'Edit File';
    case 'read_file':
      return 'Read File';
    case 'list_dir':
      return 'List Dir';
    case 'glob':
      return 'Glob';
    case 'grep':
      return 'Grep';
    case 'shell':
      return 'Terminal';
    case 'process_poll':
      return 'Process Poll';
    case 'process_kill':
      return 'Process Kill';
    case 'http':
    case 'fetch':
      return 'Fetch';
    case 'agents_spawn':
      return 'Delegate';
    default:
      return name;
  }
}
function parseFields(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
function linePairs(
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
function shellModeLines(fields: Record<string, unknown>): Array<{
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
function looksJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}
function prettyJson(text: string): string | undefined {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return undefined;
  }
}
function stringifyValue(value: unknown): string {
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
function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}
