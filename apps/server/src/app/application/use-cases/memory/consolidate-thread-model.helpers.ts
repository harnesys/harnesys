import type { SessionEvent } from 'harnesys';
import { serializeToolOutput } from 'harnesys';
import type { MemoryCandidate } from './consolidation-decisions.ts';

const TOOL_CLIP_CHARS = 1200;

export function parseExtractionFacts(raw: string): MemoryCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null || !('facts' in parsed)) {
    return [];
  }
  const facts = (parsed as { facts: unknown }).facts;
  if (!Array.isArray(facts)) {
    return [];
  }
  const candidates: MemoryCandidate[] = [];
  for (const entry of facts) {
    const candidate = candidateOf(entry);
    if (candidate) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

function candidateOf(entry: unknown): MemoryCandidate | undefined {
  if (typeof entry !== 'object' || entry === null) {
    return undefined;
  }
  const row = entry as Record<string, unknown>;
  if (typeof row.text !== 'string' || row.text.length === 0) {
    return undefined;
  }
  return {
    text: row.text,
    scope: row.scope === 'long' ? 'long' : 'session',
    ...(typeof row.key === 'string' && row.key.length > 0 ? { key: row.key } : {}),
    importance:
      typeof row.importance === 'number'
        ? Math.min(10, Math.max(0, Math.round(row.importance)))
        : 5,
  };
}

export function compactEvents(pending: SessionEvent[]): Array<Record<string, unknown>> {
  return pending.flatMap(compactEvent);
}

function compactEvent(event: SessionEvent): Array<Record<string, unknown>> {
  if (event.type === 'user') {
    return [{ type: 'user', text: event.text }];
  }
  if (event.type === 'tool') {
    return compactToolEvent(event);
  }
  if (event.type === 'compaction') {
    return [{ type: 'compaction', summary: event.summary }];
  }
  if (event.type === 'model.usage') {
    return [{ type: 'model.usage' }];
  }
  return [];
}

function compactToolEvent(
  event: Extract<SessionEvent, { type: 'tool' }>,
): Array<Record<string, unknown>> {
  if (event.phase !== 'completed' && event.phase !== 'requested') {
    return [];
  }
  return [
    {
      type: 'tool',
      name: event.name,
      ...(event.input === undefined ? {} : { input: event.input }),
      ...(event.output === undefined ? {} : { output: clip(serializeToolOutput(event.output)) }),
    },
  ];
}

function clip(text: string): string {
  if (text.length <= TOOL_CLIP_CHARS) {
    return text;
  }
  return `${text.slice(0, TOOL_CLIP_CHARS)}\n… output clipped …`;
}

export function numberAt(raw: Record<string, unknown> | undefined, keys: string[]): number {
  if (raw === undefined) {
    return 0;
  }
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}
