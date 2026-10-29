import type { SessionEvent } from 'harnesys';
import { mapApprovalText } from '../../domain/connector/hitl-text.ts';

const CLOSING = new Set(['done', 'error', 'run.completed', 'run.failed', 'run.cancelled']);

export interface AskTool {
  name: string;
  input: unknown;
}

export interface OpenAsk {
  askId: string;
  source: string;
  schema: unknown;
  runId?: string;
  tool?: AskTool;
}

export function findOpenAsk(events: SessionEvent[]): OpenAsk | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (!ev) {
      continue;
    }
    if (CLOSING.has(ev.type) || ev.type === 'hitl.answer') {
      return null;
    }
    if (ev.type === 'ask') {
      return {
        askId: ev.askId,
        source: ev.source,
        schema: ev.schema,
        runId: ev.runId,
        ...(ev.tool === undefined ? {} : { tool: { name: ev.tool.name, input: ev.tool.input } }),
      };
    }
  }
  return null;
}

export function payloadForAskText(
  ask: OpenAsk,
  text: string,
): { ok: true; payload: unknown } | { ok: false; reason: 'use_buttons' } {
  if (ask.source === 'ask_user') {
    return payloadForAskUser(ask.schema, text);
  }
  const mapped = mapApprovalText(text);
  if (mapped === null) {
    return { ok: false, reason: 'use_buttons' };
  }
  return { ok: true, payload: { approved: mapped === 'approve' } };
}

export function payloadForButtonValue(ask: OpenAsk, value: string): unknown {
  if (ask.source === 'ask_user') {
    const asJson = tryParseJson(value);
    if (asJson !== null) {
      return asJson;
    }
    return { optionIds: [value], text: value };
  }
  if (value === 'approve' || value === 'deny') {
    return { approved: value === 'approve' };
  }
  if (value === 'approve_once') {
    return { approved: true };
  }
  if (value === 'always') {
    const pattern = programPatternOf(ask.tool);
    return pattern === undefined
      ? { approved: true }
      : { approved: true, rule: { kind: 'program', pattern, target: 'agent' } };
  }
  const asJson = tryParseJson(value);
  return asJson ?? { approved: value === 'approve' };
}

function programPatternOf(tool: AskTool | undefined): string | undefined {
  if (tool?.name !== 'shell') {
    return undefined;
  }
  const command = commandOf(tool.input);
  if (!command) {
    return undefined;
  }
  const program = (command.trim().split(/\s+/)[0] ?? '').replace(/^['"]+|['"]+$/g, '');
  return program ? `${program} *` : undefined;
}

function commandOf(input: unknown): string | undefined {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return undefined;
    }
    if (trimmed.startsWith('{')) {
      return commandOf(tryParseJson(trimmed)) ?? trimmed;
    }
    return trimmed;
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }
  const command = (input as Record<string, unknown>).command;
  return typeof command === 'string' && command.trim() ? command.trim() : undefined;
}

function payloadForAskUser(
  schema: unknown,
  text: string,
): { ok: true; payload: unknown } | { ok: false; reason: 'use_buttons' } {
  const options = optionIdsOf(schema);
  const allowsText = schemaAllowsText(schema);
  if (options.length > 0 && !options.includes(text) && !allowsText) {
    return { ok: false, reason: 'use_buttons' };
  }
  if (options.includes(text)) {
    return { ok: true, payload: { optionIds: [text], text } };
  }
  return { ok: true, payload: { text } };
}

function optionIdsOf(schema: unknown): string[] {
  const rec = asRecord(schema);
  if (rec === null) {
    return [];
  }
  if (Array.isArray(rec.options)) {
    return rec.options.map(optionIdOf).filter((id): id is string => id !== null);
  }
  return enumFromOptionIdsProperty(rec.properties);
}

function optionIdOf(item: unknown): string | null {
  const rec = asRecord(item);
  return rec !== null && typeof rec.id === 'string' ? rec.id : null;
}

function enumFromOptionIdsProperty(properties: unknown): string[] {
  const props = asRecord(properties);
  const optionIds = props ? asRecord(props.optionIds) : null;
  const items = optionIds ? asRecord(optionIds.items) : null;
  if (items === null || !Array.isArray(items.enum)) {
    return [];
  }
  return items.enum.filter((v): v is string => typeof v === 'string');
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}

function schemaAllowsText(schema: unknown): boolean {
  const rec = asRecord(schema);
  const properties = rec ? asRecord(rec.properties) : null;
  if (properties === null) {
    return true;
  }
  return 'text' in properties;
}

function tryParseJson(value: string): unknown | null {
  if (!value.startsWith('{') && !value.startsWith('[')) {
    return null;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
