import type { SessionEvent } from '@harnesys/studio-shared';
export interface ToolCaption {
  title: string;
  hint: string;
  kind: 'terminal' | 'file' | 'search' | 'globe' | 'pencil' | 'question';
}
interface CaptionSpec {
  kind: ToolCaptionKind;
  title: string;
  fields?: string[];
  transform?: 'basename' | 'ms';
}

type ToolCaptionKind = 'terminal' | 'file' | 'search' | 'globe' | 'pencil' | 'question';

const CAPTION_SPECS: Record<string, CaptionSpec> = {
  shell: { kind: 'terminal', title: 'Terminal', fields: ['command'] },
  process_poll: { kind: 'terminal', title: 'Process Poll', fields: ['job_id', 'jobId'] },
  process_kill: { kind: 'terminal', title: 'Process Kill', fields: ['job_id', 'jobId'] },
  read_file: { kind: 'file', title: 'Read File', fields: ['path'], transform: 'basename' },
  write_file: { kind: 'pencil', title: 'Write File', fields: ['path'], transform: 'basename' },
  edit_file: { kind: 'pencil', title: 'Edit File', fields: ['path'], transform: 'basename' },
  list_dir: { kind: 'file', title: 'List Dir', fields: ['path'] },
  glob: { kind: 'search', title: 'Glob', fields: ['pattern'] },
  grep: { kind: 'search', title: 'Grep', fields: ['pattern'] },
  http: { kind: 'globe', title: 'Fetch', fields: ['url'] },
  fetch: { kind: 'globe', title: 'Fetch', fields: ['url'] },
  ask_user: { kind: 'question', title: 'Question', fields: ['prompt'] },
  load_skill: { kind: 'file', title: 'Skill', fields: ['name'] },
  wait: { kind: 'question', title: 'Wait', fields: ['delayMs'], transform: 'ms' },
  schedule_list: { kind: 'search', title: 'Schedules' },
  thread_list: { kind: 'search', title: 'Threads' },
  schedule_peek: { kind: 'search', title: 'Schedule Log', fields: ['id'] },
  schedule_set: { kind: 'pencil', title: 'Schedule', fields: ['name', 'id'] },
  schedule_pause: { kind: 'pencil', title: 'Schedule Pause', fields: ['id'] },
  schedule_delete: { kind: 'pencil', title: 'Schedule Delete', fields: ['id'] },
  plan_save: { kind: 'pencil', title: 'Plan', fields: ['overview'] },
  plan_item_update: { kind: 'pencil', title: 'Plan Item', fields: ['itemId', 'status'] },
  plan_get: { kind: 'search', title: 'Plan' },
  webhook_list: { kind: 'globe', title: 'Webhooks' },
  webhook_set: { kind: 'pencil', title: 'Webhook', fields: ['name', 'id'] },
  webhook_delete: { kind: 'pencil', title: 'Webhook Delete', fields: ['id'] },
};

export function toolCaption(
  call: SessionEvent & {
    type: 'tool';
  },
  result?: SessionEvent & {
    type: 'tool';
  },
): ToolCaption {
  const name = call.name;
  const inputStr = toolInput(call);
  const outputStr = result ? toolOutput(result) : '';
  if (name === 'map') {
    return mapCaption(inputStr, outputStr);
  }
  const spec = CAPTION_SPECS[name];
  if (!spec) {
    return { kind: 'file', title: humanizeToolName(name), hint: firstLine(inputStr, outputStr) };
  }
  return { kind: spec.kind, title: spec.title, hint: captionHint(spec, inputStr, outputStr) };
}

function mapCaption(inputStr: string, outputStr: string): ToolCaption {
  const count = mapItemCount(inputStr, outputStr);
  return {
    kind: 'search',
    title: 'Map',
    hint:
      count !== undefined
        ? `${count} item${count === 1 ? '' : 's'}`
        : firstLine(inputStr, outputStr),
  };
}

function captionHint(spec: CaptionSpec, inputStr: string, outputStr: string): string {
  const fields = fieldsOf(inputStr || outputStr);
  const raw = firstField(fields, spec.fields);
  if (spec.transform === 'basename') {
    return baseName(raw ?? firstLine(inputStr, outputStr));
  }
  if (spec.transform === 'ms') {
    return raw ? `${raw}ms` : firstLine(inputStr, outputStr);
  }
  return raw ?? firstLine(inputStr, outputStr);
}

function firstField(
  fields: Record<string, string>,
  keys: string[] | undefined,
): string | undefined {
  for (const key of keys ?? []) {
    const value = fields[key];
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}
function toolInput(
  call: SessionEvent & {
    type: 'tool';
  },
): string {
  const input = call.input;
  if (input != null) {
    return typeof input === 'string' ? input : JSON.stringify(input);
  }
  const delta = (
    call as {
      delta?: string;
    }
  ).delta;
  if (typeof delta === 'string' && delta) {
    return delta;
  }
  return '';
}
function toolOutput(
  result: SessionEvent & {
    type: 'tool';
  },
): string {
  const output = result.output;
  if (output == null) {
    return '';
  }
  return typeof output === 'string' ? output : JSON.stringify(output);
}
function fieldsOf(raw: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' || typeof value === 'number') {
        out[key] = String(value);
      }
    }
    if (Object.keys(out).length > 0) {
      return out;
    }
  } catch {}
  const out: Record<string, string> = {};
  for (const key of ['path', 'pattern', 'command', 'url']) {
    const re = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`);
    const m = raw.match(re);
    if (m?.[1]) {
      out[key] = m[1];
    }
  }
  return out;
}
function mapItemCount(inputStr: string, outputStr: string): number | undefined {
  for (const raw of [outputStr, inputStr]) {
    if (!raw) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        continue;
      }
      const rec = parsed as Record<string, unknown>;
      if (typeof rec.count === 'number' && Number.isFinite(rec.count)) {
        return rec.count;
      }
      if (Array.isArray(rec.items)) {
        return rec.items.length;
      }
    } catch {}
  }
  return undefined;
}
function firstLine(input: string, output: string): string {
  const source = input || output;
  const line = source.split('\n')[0] ?? '';
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}
function baseName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts.at(-1) ?? path;
}
function humanizeToolName(name: string): string {
  const words = name
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(' ') : name;
}
