import type { ExplainEntry, ExplainStatus } from './capability-explain.ts';
import type { LlmNote, LlmNoteProvider } from './llm-notes.ts';

const DIGEST_MAX_LINES = 12;
const ABSENT_STATUSES: readonly ExplainStatus[] = [
  'disabled',
  'dropped-by-mode',
  'denied-by-universe',
  'denied-by-permission',
];

export function capabilityDigest(explain: ExplainEntry[], present?: ReadonlySet<string>): string[] {
  const lines: string[] = [];
  const emitted = new Set<string>();
  const absent = explain.filter(
    (entry) =>
      entry.kind === 'tool' &&
      ABSENT_STATUSES.includes(entry.status) &&
      present?.has(entry.item) !== true,
  );
  const groupCounts = new Map<string, number>();
  for (const entry of absent) {
    const key = `${entry.source} ${entry.reason}`;
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
  }
  for (const entry of absent) {
    const key = `${entry.source} ${entry.reason}`;
    const groupSize = groupCounts.get(key) ?? 1;
    if (groupSize >= 3) {
      if (emitted.has(key)) {
        continue;
      }
      emitted.add(key);
      lines.push(`${entry.source} — ${groupSize} tools: ${entry.reason}`);
      continue;
    }
    const line = `${entry.item} — ${entry.reason}`;
    if (emitted.has(line)) {
      continue;
    }
    emitted.add(line);
    lines.push(line);
  }
  const overflow = lines.length - DIGEST_MAX_LINES;
  if (overflow > 0) {
    return [...lines.slice(0, DIGEST_MAX_LINES), `… +${overflow} more unavailable capabilities`];
  }
  return lines;
}

export function capabilityNote(digest: string[]): LlmNote | null {
  if (digest.length === 0) {
    return null;
  }
  return {
    tag: 'capabilities',
    text:
      `Capabilities absent from this run — never attempt them, plan around them or report them as blockers:\n` +
      digest.map((line) => `- ${line}`).join('\n') +
      '\nIf a task needs an absent capability, deliver the partial result and state the exact blocker instead of retrying.',
  };
}

export function createCapabilityLinesProvider(lines: string[]): LlmNoteProvider {
  return () => {
    const note = capabilityNote(lines);
    return note === null ? [] : [note];
  };
}

export function createCapabilityNoteProvider(
  explain: ExplainEntry[],
  present?: ReadonlySet<string>,
): LlmNoteProvider {
  return createCapabilityLinesProvider(capabilityDigest(explain, present));
}
