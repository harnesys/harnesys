import { detectLanguage, diffFromEdit } from '@/shared/lib/tool-code';
import {
  asRecord,
  linePairs,
  linesSummary,
  looksJson,
  optField,
  prettyJson,
  type SummaryBuilder,
  shellModeLines,
  strField,
  stringifyValue,
  type ToolInputPreview,
  type ToolInputSummary,
  truncate,
} from './tool-input-fields';

export type { ToolInputPreview, ToolInputSummary } from './tool-input-fields';

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

const SUMMARY_BUILDERS: Record<string, SummaryBuilder> = {
  write_file: writeSummary,
  edit_file: editSummary,
  delete_file: deleteSummary,
  move_file: moveSummary,
  read_file: linesSummary(['path', 'offset', 'limit']),
  list_dir: linesSummary(['path', 'depth']),
  glob: linesSummary(['pattern', 'path']),
  grep: linesSummary(['pattern', 'path', 'glob']),
  shell: shellSummary,
  terminal_spawn: linesSummary(['name', 'command']),
  terminal_read: linesSummary(['session', 'since', 'until']),
  terminal_write: linesSummary(['session', 'data']),
  terminal_kill: linesSummary(['session']),
  port_forward: linesSummary(['mode', 'spec']),
  remote_copy: linesSummary(['direction', 'local_path', 'remote_path']),
  http: fetchSummary,
  fetch: fetchSummary,
  agents_spawn: spawnSummary,
};

function writeSummary(title: string, fields: Record<string, unknown>): ToolInputSummary {
  const batch = batchText(fields.files, pathText);
  if (batch !== undefined) {
    return { title, lines: [{ label: 'files', value: batch }] };
  }
  return {
    title,
    lines: linePairs(fields, ['path']),
    preview: contentPreview(strField(fields, 'path'), strField(fields, 'content')),
  };
}

function editSummary(title: string, fields: Record<string, unknown>): ToolInputSummary {
  const batch = batchText(fields.edits, pathText);
  if (batch !== undefined) {
    return { title, lines: [{ label: 'edits', value: batch }] };
  }
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

function deleteSummary(title: string, fields: Record<string, unknown>): ToolInputSummary {
  const lines = linePairs(fields, ['path', 'pattern', 'recursive', 'dry_run']);
  const batch = batchText(fields.paths, (entry) => String(entry));
  if (batch !== undefined) {
    lines.unshift({ label: 'paths', value: batch });
  }
  return { title, lines };
}

function moveSummary(title: string, fields: Record<string, unknown>): ToolInputSummary {
  const lines = linePairs(fields, ['from', 'to', 'overwrite']);
  const batch = batchText(fields.moves, pairText);
  if (batch !== undefined) {
    lines.unshift({ label: 'moves', value: batch });
  }
  return { title, lines };
}

function pathText(entry: unknown): string {
  return strField(asRecord(entry), 'path');
}

function pairText(entry: unknown): string {
  const rec = asRecord(entry);
  return `${strField(rec, 'from')} → ${strField(rec, 'to')}`;
}

function batchText(list: unknown, textOf: (entry: unknown) => string): string | undefined {
  if (!Array.isArray(list)) {
    return undefined;
  }
  return truncate(list.map(textOf).join(', '), 160);
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
    const rec = asRecord(call);
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
    const rec = asRecord(message);
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
    case 'delete_file':
      return 'Delete File';
    case 'move_file':
      return 'Move File';
    case 'read_file':
      return 'Read File';
    case 'list_dir':
      return 'List Dir';
    case 'glob':
      return 'Glob';
    case 'grep':
      return 'Grep';
    case 'shell':
      return 'Shell';
    case 'terminal_spawn':
      return 'Spawn Terminal';
    case 'terminal_read':
      return 'Read Terminal';
    case 'terminal_write':
      return 'Write Terminal';
    case 'terminal_kill':
      return 'Kill Terminal';
    case 'port_forward':
      return 'Port Forward';
    case 'remote_copy':
      return 'Remote Copy';
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
