import { eq } from 'drizzle-orm';
import {
  type CallModelResult,
  callModel,
  MEMORY_EXTRACTION_RUBRIC,
  MEMORY_RECONCILE_RUBRIC,
  type MemoryRecordSource,
  type ModelBinding,
  type ModelUsage,
  type PendingSessionEvent,
  type RunEventStore,
  type SemanticScope,
  type SessionEvent,
} from 'harnesys';
import type { AgentRecord } from '../../../domain/agent/agent.ts';
import type { OrgSqliteDb } from '../../../infra/org-sqlite/org-sqlite-session.ts';
import { memoryFactsTable } from '../../../infra/org-sqlite/schema/agent-memory.ts';
import type { OrgSemanticPort } from '../../../infra/runtime/packs/org-semantic.port.ts';
import { compactEvents, numberAt } from './consolidate-thread-model.helpers.ts';
import { type ConsolidationDecision, type MemoryCandidate } from './consolidation-decisions.ts';

export interface AgentModelCoords {
  provider: string;
  model: string;
  modelId?: string;
}

export type AgentModelCoordsResolver = (agent: AgentRecord) => AgentModelCoords | undefined;

export type ConsolidateModelCoordsResolver = (modelId: string) => AgentModelCoords | undefined;

export interface FactContextRow {
  id: string;
  text: string;
  key: string | null;
}

export interface AppliedFactRow {
  factId: string;
  action: 'added' | 'updated';
  text: string;
}

export interface AppliedCounts {
  added: number;
  updated: number;
  superseded: number;
  skipped: number;
  supersededPairs: Array<{ factId: string; supersededById: string }>;
  wrote: AppliedFactRow[];
}

export function emptyCounts(): AppliedCounts {
  return { added: 0, updated: 0, superseded: 0, skipped: 0, supersededPairs: [], wrote: [] };
}

export interface ConsolidationEventInput {
  threadId: string;
  runId: string;
  agentId: string;
  counts: AppliedCounts;
  usage: ModelUsage;
  subtype?: 'memory.consolidated' | 'memory.reflected';
}

export function appendConsolidationEvents(
  events: RunEventStore,
  input: ConsolidationEventInput,
): void {
  const { threadId, runId, agentId, counts, usage } = input;
  const pending: PendingSessionEvent[] = [
    {
      type: 'memory',
      subtype: input.subtype ?? 'memory.consolidated',
      added: counts.added,
      updated: counts.updated,
      superseded: counts.superseded,
      skipped: counts.skipped,
      ...(counts.wrote.length > 0 ? { facts: counts.wrote } : {}),
    },
    ...counts.supersededPairs.map(
      (pair): PendingSessionEvent => ({
        type: 'memory',
        subtype: 'memory.superseded',
        factId: pair.factId,
        supersededById: pair.supersededById,
      }),
    ),
  ];
  if (usage.promptTokens > 0 || usage.generatedTokens > 0) {
    pending.push({ type: 'model.usage', usage, agentId, origin: 'memory' });
  }
  void events.appendForThread(threadId, runId, pending);
}

export function resolveCoords(
  agent: AgentRecord,
  consolidateModelId: string | undefined,
  agentModelCoords: AgentModelCoordsResolver | undefined,
  consolidateModelCoords: ConsolidateModelCoordsResolver | undefined,
): { coords: AgentModelCoords; overrideFailed: boolean } | null {
  const override = consolidateModelId?.trim() ?? '';
  if (override !== '' && consolidateModelCoords !== undefined) {
    const overrideCoords = consolidateModelCoords(override);
    if (overrideCoords !== undefined) {
      return { coords: overrideCoords, overrideFailed: false };
    }
    const fallback = agentModelCoords?.(agent);
    return fallback === undefined ? null : { coords: fallback, overrideFailed: true };
  }
  const base = agentModelCoords?.(agent);
  return base === undefined ? null : { coords: base, overrideFailed: false };
}

export async function completeOnce(
  binding: ModelBinding,
  prompt: string,
): Promise<CallModelResult | undefined> {
  const stream = callModel({
    binding,
    prompt: '',
    messages: [{ role: 'user', content: prompt }],
    toolNames: [],
    signalOrRegistry: undefined,
  });
  let completed: CallModelResult | undefined;
  for await (const chunk of stream) {
    if (chunk.type === 'completed') {
      completed = chunk;
    }
  }
  return completed;
}

export function usageOf(coords: AgentModelCoords, result: CallModelResult): ModelUsage {
  const raw = result.usage as Record<string, unknown> | undefined;
  const cacheRead = numberAt(raw, ['cachedInputTokens', 'cacheReadTokens', 'cacheRead']);
  const reasoning = numberAt(raw, ['reasoningTokens', 'reasoning_tokens', 'reasoning']);
  return {
    model: coords.model,
    ...(coords.modelId !== undefined ? { modelId: coords.modelId } : {}),
    promptTokens: numberAt(raw, ['inputTokens', 'promptTokens', 'input_tokens', 'prompt_tokens']),
    generatedTokens: numberAt(raw, [
      'outputTokens',
      'generatedTokens',
      'output_tokens',
      'completion_tokens',
    ]),
    ...(cacheRead > 0 ? { cacheReadTokens: cacheRead } : {}),
    ...(reasoning > 0 ? { reasoningTokens: reasoning } : {}),
  };
}

export function extractionPrompt(pending: SessionEvent[]): string {
  return `${MEMORY_EXTRACTION_RUBRIC}\n\nConversation events (JSON):\n${JSON.stringify(
    compactEvents(pending),
  )}`;
}

export function reconcilePrompt(candidates: MemoryCandidate[], context: FactContextRow[]): string {
  return `${MEMORY_RECONCILE_RUBRIC}\n\nCandidates (JSON):\n${JSON.stringify(
    candidates,
  )}\n\nExisting facts (JSON):\n${JSON.stringify(context)}`;
}

export interface ReflectFactRow {
  id: string;
  text: string;
  key: string | null;
  importance: number;
}

export interface FactWriteInput {
  db: OrgSqliteDb;
  semantic: OrgSemanticPort;
  scopeId: { orgId: string; agentName: string; threadId?: string };
  context: FactContextRow[];
  candidates: MemoryCandidate[];
  decisions: ConsolidationDecision[];
  counts: AppliedCounts;
  source: MemoryRecordSource;
  scopeOf: (candidate: MemoryCandidate) => SemanticScope;
}

export async function applyFactDecisions(input: FactWriteInput): Promise<void> {
  for (const decision of input.decisions) {
    const candidate = input.candidates[decision.index];
    if (candidate === undefined) {
      continue;
    }
    await applyFactDecision(input, decision, candidate);
  }
}

async function applyFactDecision(
  input: FactWriteInput,
  decision: ConsolidationDecision,
  candidate: MemoryCandidate,
): Promise<void> {
  const { counts, context } = input;
  if (decision.action === 'noop') {
    counts.skipped += 1;
    return;
  }
  const text = decision.text ?? candidate.text;
  const importance = decision.importance ?? candidate.importance;
  const existing =
    decision.action === 'update' || decision.action === 'supersede'
      ? presentedFactOf(context, decision.existingId)
      : null;
  if (decision.action === 'update' && existing !== null) {
    await input.semantic.update(input.scopeId, { id: existing.id, text });
    setFactImportance(input.db, existing.id, importance);
    counts.updated += 1;
    counts.wrote.push({ factId: existing.id, action: 'updated', text });
    return;
  }
  const created = await input.semantic.upsert(input.scopeId, {
    scope: input.scopeOf(candidate),
    text,
    ...(candidate.key === undefined ? {} : { key: candidate.key }),
    threadId: input.scopeId.threadId,
    source: input.source,
  });
  setFactImportance(input.db, created.id, importance);
  counts.wrote.push({ factId: created.id, action: 'added', text });
  if (decision.action === 'supersede' && existing !== null) {
    input.db
      .update(memoryFactsTable)
      .set({ supersededBy: created.id })
      .where(eq(memoryFactsTable.id, existing.id))
      .run();
    counts.superseded += 1;
    counts.supersededPairs.push({ factId: existing.id, supersededById: created.id });
    return;
  }
  counts.added += 1;
}

function setFactImportance(db: OrgSqliteDb, id: string, importance: number | undefined): void {
  if (importance === undefined) {
    return;
  }
  db.update(memoryFactsTable).set({ importance }).where(eq(memoryFactsTable.id, id)).run();
}

function presentedFactOf(
  context: FactContextRow[],
  existingId: string | undefined,
): FactContextRow | null {
  if (existingId === undefined) {
    return null;
  }
  return context.find((row) => row.id === existingId) ?? null;
}
