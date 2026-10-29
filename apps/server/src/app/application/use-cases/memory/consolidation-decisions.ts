import type { SemanticScope, SessionEvent } from 'harnesys';

export interface MemoryCandidate {
  text: string;
  scope: SemanticScope;
  key?: string;
  importance: number;
}

export type ConsolidationAction = 'add' | 'update' | 'noop' | 'supersede';

export interface ConsolidationDecision {
  index: number;
  action: ConsolidationAction;
  text?: string;
  importance?: number;
  existingId?: string;
}

export function parseConsolidationVerdict(
  raw: string,
  candidates: MemoryCandidate[],
): ConsolidationDecision[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!hasDecisions(parsed)) {
    return [];
  }
  const decisions: ConsolidationDecision[] = [];
  for (const entry of parsed.decisions) {
    const decision = decisionOf(entry, candidates);
    if (decision !== undefined) {
      decisions.push(decision);
    }
  }
  return decisions;
}

function hasDecisions(parsed: unknown): parsed is { decisions: unknown[] } {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    'decisions' in parsed &&
    Array.isArray((parsed as { decisions: unknown }).decisions)
  );
}

const ACTIONS: ConsolidationAction[] = ['add', 'update', 'noop', 'supersede'];

function decisionOf(
  entry: unknown,
  candidates: MemoryCandidate[],
): ConsolidationDecision | undefined {
  if (typeof entry !== 'object' || entry === null) {
    return undefined;
  }
  const row = entry as Record<string, unknown>;
  const index = row.index;
  if (typeof index !== 'number' || index < 0 || index >= candidates.length) {
    return undefined;
  }
  const action = typeof row.action === 'string' ? row.action.trim().toLowerCase() : '';
  if (!ACTIONS.includes(action as ConsolidationAction)) {
    return undefined;
  }
  return shapedDecisionOf(index, action as ConsolidationAction, row);
}

function shapedDecisionOf(
  index: number,
  action: ConsolidationAction,
  row: Record<string, unknown>,
): ConsolidationDecision | undefined {
  const decision: ConsolidationDecision = { index, action };
  if (typeof row.text === 'string' && row.text.length > 0) {
    decision.text = row.text;
  }
  if (typeof row.importance === 'number') {
    decision.importance = Math.min(10, Math.max(0, Math.round(row.importance)));
  } else if (action === 'add') {
    decision.importance = 5;
  }
  if (action === 'update' || action === 'supersede') {
    if (decision.text === undefined || typeof row.existingId !== 'string') {
      return undefined;
    }
    if (row.existingId.length === 0) {
      return undefined;
    }
    decision.existingId = row.existingId;
  }
  return decision;
}

export interface EventCursor {
  lastRunId: string;
  lastSeq: number;
}

export function pendingEventsOf(
  threadEvents: SessionEvent[],
  cursor: EventCursor | undefined,
): SessionEvent[] {
  if (cursor === undefined) {
    return threadEvents;
  }
  const cursorIndex = threadEvents.findIndex(
    (event) => event.runId === cursor.lastRunId && event.seq === cursor.lastSeq,
  );
  if (cursorIndex === -1) {
    return threadEvents;
  }
  return threadEvents.slice(cursorIndex + 1);
}
