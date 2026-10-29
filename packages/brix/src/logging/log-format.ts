export interface LogRecord {
  level: number;
  time: number;
  msg: string;
  [key: string]: unknown;
}

export interface FormatLogLineOptions {
  color: boolean;
}

const RESET = '\u001b[0m';
const DIM = '\u001b[90m';
const CONTEXT = '\u001b[35m';
const ERROR = '\u001b[31;1m';

interface LevelStyle {
  name: string;
  color: string;
}

const LEVEL_STYLES: Record<number, LevelStyle> = {
  10: { name: 'TRACE', color: DIM },
  20: { name: 'DEBUG', color: '\u001b[36m' },
  30: { name: 'INFO', color: '\u001b[32m' },
  40: { name: 'WARN', color: '\u001b[33m' },
  50: { name: 'ERROR', color: ERROR },
  60: { name: 'FATAL', color: ERROR },
};

const META_FIELDS = new Set(['level', 'time', 'msg', 'context', 'pid', 'hostname', 'name']);

interface RenderedValue {
  text: string;
  stack?: string;
}

function paint(text: string, color: string, enabled: boolean): string {
  return enabled ? `${color}${text}${RESET}` : text;
}

function formatTimestamp(time: number): string {
  const date = new Date(time);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const millis = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function renderPlainValue(value: unknown): string {
  if (typeof value === 'string') {
    return /\s/.test(value) ? `"${value}"` : value;
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function renderErrorMessage(value: Record<string, unknown>): string {
  const type = typeof value.type === 'string' ? value.type : undefined;
  const message = typeof value.message === 'string' ? value.message : undefined;
  if (message !== undefined && type !== undefined) {
    return `${type}: ${message}`;
  }
  if (message !== undefined) {
    return message;
  }
  return JSON.stringify(value);
}

function renderValue(value: unknown): RenderedValue {
  if (isRecord(value) && typeof value.stack === 'string') {
    return { text: renderErrorMessage(value), stack: value.stack };
  }
  return { text: renderPlainValue(value) };
}

function dropFirstLine(text: string): string {
  return text.split('\n').slice(1).join('\n');
}

function renderFields(record: LogRecord, color: boolean): { inline: string; stacks: string[] } {
  const inline: string[] = [];
  const stacks: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (META_FIELDS.has(key)) {
      continue;
    }
    const rendered = renderValue(value);
    inline.push(`${key}=${rendered.text}`);
    const stack = rendered.stack === undefined ? '' : dropFirstLine(rendered.stack);
    if (stack.length > 0) {
      stacks.push(paint(stack, DIM, color));
    }
  }
  return { inline: inline.length > 0 ? paint(inline.join(' '), DIM, color) : '', stacks };
}

export function formatLogLine(record: LogRecord, options: FormatLogLineOptions): string {
  const style = LEVEL_STYLES[record.level] ?? { name: String(record.level), color: DIM };
  const parts = [
    paint(formatTimestamp(record.time), DIM, options.color),
    paint(style.name.padEnd(5, ' '), style.color, options.color),
  ];
  if (typeof record.context === 'string' && record.context.length > 0) {
    parts.push(paint(`[${record.context}]`, CONTEXT, options.color));
  }
  parts.push(record.msg);
  const fields = renderFields(record, options.color);
  if (fields.inline.length > 0) {
    parts.push(fields.inline);
  }
  const line = parts.join(' ');
  return fields.stacks.length > 0 ? `${line}\n${fields.stacks.join('\n')}` : line;
}
