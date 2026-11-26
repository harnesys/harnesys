export const TRIGGER_HUMAN_ORIGIN = 'trigger';

export interface TriggerTaskField {
  label: string;
  value: string;
  href?: string;
}

export interface TriggerTaskInput {
  addonId: string;
  triggerId: string;
  label: string;
  title?: string;
  text?: string;
  fields?: TriggerTaskField[];
  instructions?: string;
}

export interface TriggerTaskNote {
  kind: 'output' | 'failure';
  text: string;
}

export interface TriggerTaskView {
  addonId: string;
  triggerId: string;
  label: string;
  title: string;
  body: string;
  fields: TriggerTaskField[];
  instructions: string;
  notes: TriggerTaskNote[];
}

const TRIGGER_BLOCK = /^\s*<trigger\b([^>]*)>([\s\S]*?)<\/trigger>([\s\S]*)$/;
const ATTR_RE = /([a-z][a-z0-9-]*)="([^"]*)"/gi;
const FIELD_RE = /<field\b([^>]*)>([\s\S]*?)<\/field>/g;
const NOTE_RE = /<(pre-run-output|pre-run-failure)>([\s\S]*?)<\/\1>/g;

export function triggerTaskText(input: TriggerTaskInput): string {
  const attrs = [
    `addon="${escapeAttr(input.addonId)}"`,
    `trigger="${escapeAttr(input.triggerId)}"`,
    `label="${escapeAttr(input.label)}"`,
  ];
  const lines = [`<trigger ${attrs.join(' ')}>`];
  const title = (input.title ?? input.label).trim();
  if (title) {
    lines.push(`<title>${escapeText(title)}</title>`);
  }
  for (const field of input.fields ?? []) {
    if (!field.label.trim() || !field.value.trim()) {
      continue;
    }
    const href = field.href ? ` href="${escapeAttr(field.href)}"` : '';
    lines.push(
      `<field label="${escapeAttr(field.label)}"${href}>${escapeText(field.value)}</field>`,
    );
  }
  const body = (input.text ?? '').trim();
  if (body) {
    lines.push(`<body>\n${escapeText(body)}\n</body>`);
  }
  const instructions = (input.instructions ?? '').trim();
  if (instructions) {
    lines.push(`<instructions>\n${escapeText(instructions)}\n</instructions>`);
  }
  lines.push('</trigger>');
  return lines.join('\n');
}

export function parseTriggerTaskText(text: string): TriggerTaskView | null {
  const block = text.match(TRIGGER_BLOCK);
  if (!block) {
    return null;
  }
  const attrs = attrsOf(block[1] ?? '');
  const inner = block[2] ?? '';
  return {
    addonId: attrs.addon ?? '',
    triggerId: attrs.trigger ?? '',
    label: attrs.label ?? '',
    title: innerTag(inner, 'title') || attrs.label || attrs.trigger || 'Trigger',
    body: innerTag(inner, 'body'),
    fields: fieldsOf(inner),
    instructions: innerTag(inner, 'instructions'),
    notes: notesOf(block[3] ?? ''),
  };
}

function notesOf(rest: string): TriggerTaskNote[] {
  const notes: TriggerTaskNote[] = [];
  for (const match of rest.matchAll(NOTE_RE)) {
    const text = unescapeXml(match[2] ?? '').trim();
    if (text.length === 0) {
      continue;
    }
    notes.push({ kind: match[1] === 'pre-run-failure' ? 'failure' : 'output', text });
  }
  return notes;
}

function fieldsOf(inner: string): TriggerTaskField[] {
  const fields: TriggerTaskField[] = [];
  for (const match of inner.matchAll(FIELD_RE)) {
    const attrs = attrsOf(match[1] ?? '');
    const value = unescapeXml(match[2] ?? '').trim();
    if (!attrs.label || !value) {
      continue;
    }
    fields.push({
      label: unescapeXml(attrs.label),
      value,
      ...(attrs.href ? { href: unescapeXml(attrs.href) } : {}),
    });
  }
  return fields;
}

function attrsOf(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTR_RE)) {
    const key = match[1];
    const value = match[2];
    if (key && value !== undefined) {
      attrs[key] = value;
    }
  }
  return attrs;
}

function innerTag(inner: string, tag: string): string {
  const match = inner.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? unescapeXml(match[1] ?? '').trim() : '';
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;');
}

function unescapeXml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}
