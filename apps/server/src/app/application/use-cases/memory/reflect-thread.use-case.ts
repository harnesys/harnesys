import { parseMemoryPolicy } from '@harnesys/contracts';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import {
  type CallModelResult,
  type EpisodicHit,
  type EpisodicPort,
  type Logger,
  MEMORY_REFLECT_EPISODIC_LIMIT,
  MEMORY_REFLECT_FACTS_LIMIT,
  MEMORY_REFLECT_RUBRIC,
  type ModelsPort,
  type ModelUsage,
  type RunEventStore,
} from 'harnesys';
import type { AgentRecord } from '../../../domain/agent/agent.ts';
import type { EmbeddingsPort } from '../../../infra/knowledge/embeddings.ts';
import { OrgMemoryReflectStore } from '../../../infra/memory/org-memory-reflect.store.ts';
import type { OrgSqliteDb } from '../../../infra/org-sqlite/org-sqlite-session.ts';
import {
  type MemoryFactRow,
  memoryFactsTable,
} from '../../../infra/org-sqlite/schema/agent-memory.ts';
import { OrgSemanticPort } from '../../../infra/runtime/packs/org-semantic.port.ts';
import {
  type AgentModelCoords,
  type AgentModelCoordsResolver,
  type AppliedCounts,
  appendConsolidationEvents,
  applyFactDecisions,
  type ConsolidateModelCoordsResolver,
  completeOnce,
  emptyCounts,
  resolveCoords,
  usageOf,
} from './consolidate-thread-model.ts';
import { type MemoryCandidate, parseConsolidationVerdict } from './consolidation-decisions.ts';

const HOUR_MS = 3_600_000;

export interface ReflectThreadDeps {
  db: OrgSqliteDb;
  models: ModelsPort;
  events: RunEventStore;
  logger: Logger;
  embeddings?: EmbeddingsPort;
  episodic?: EpisodicPort;
  agentModelCoords?: AgentModelCoordsResolver;
  consolidateModelCoords?: ConsolidateModelCoordsResolver;
}

export interface ReflectOrigin {
  threadId: string;
  runId: string;
}

export interface ReflectFactRow {
  id: string;
  text: string;
  key: string | null;
  importance: number;
}

export function reflectPrompt(
  sessionFacts: ReflectFactRow[],
  episodic: EpisodicHit[],
  longContext: ReflectFactRow[],
): string {
  const episodicSection =
    episodic.length === 0
      ? ''
      : `\n\nRecent episodic experience (JSON):\n${JSON.stringify(episodic.map(toEpisodicRow))}`;
  return `${MEMORY_REFLECT_RUBRIC}\n\nSession facts (JSON):\n${JSON.stringify(
    sessionFacts,
  )}${episodicSection}\n\nLong-term facts (JSON):\n${JSON.stringify(longContext)}`;
}

function toEpisodicRow(hit: EpisodicHit): { threadId: string; text: string } {
  const text =
    hit.text.length > EPISODIC_CLIP_CHARS ? `${hit.text.slice(0, EPISODIC_CLIP_CHARS)}…` : hit.text;
  return { threadId: hit.threadId, text };
}

const EPISODIC_CLIP_CHARS = 400;

export function reflectDue(
  lastReflectedAt: string | undefined,
  nowMs: number,
  intervalHours: number,
): boolean {
  if (lastReflectedAt === undefined || lastReflectedAt === '') {
    return true;
  }
  const lastMs = Date.parse(lastReflectedAt);
  if (!Number.isFinite(lastMs)) {
    return true;
  }
  return nowMs - lastMs >= intervalHours * HOUR_MS;
}

export class ReflectThreadUseCase {
  private readonly semantic: OrgSemanticPort;
  private readonly reflects: OrgMemoryReflectStore;

  constructor(private readonly deps: ReflectThreadDeps) {
    this.semantic = new OrgSemanticPort(deps.db, deps.embeddings);
    this.reflects = new OrgMemoryReflectStore(deps.db);
  }

  async execute(
    orgId: string,
    agent: AgentRecord,
    nowMs: number,
    origin?: ReflectOrigin,
  ): Promise<void> {
    try {
      await this.run(orgId, agent, nowMs, origin);
    } catch (err) {
      this.deps.logger.warn('memory reflect failed', {
        orgId,
        agentName: agent.name,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async run(
    orgId: string,
    agent: AgentRecord,
    nowMs: number,
    origin?: ReflectOrigin,
  ): Promise<void> {
    const policy = parseMemoryPolicy(agent.config.memoryPolicyJson);
    if (policy?.reflect !== true) {
      return;
    }
    const lastReflectedAt = this.reflects.find(orgId, agent.name);
    if (!reflectDue(lastReflectedAt, nowMs, policy.reflectInterval ?? 24)) {
      return;
    }
    const sessionRows = this.factRowsOf(orgId, agent.name, 'session');
    if (sessionRows.length === 0) {
      return;
    }
    const longRows = this.factRowsOf(orgId, agent.name, 'long');
    const episodic = await this.episodicHitsOf(orgId, agent.id);
    const resolved = resolveCoords(
      agent,
      policy.consolidateModelId,
      this.deps.agentModelCoords,
      this.deps.consolidateModelCoords,
    );
    if (resolved === null) {
      this.deps.logger.warn('memory reflect skipped: no model', {
        orgId,
        agentName: agent.name,
      });
      return;
    }
    const binding = await this.deps.models.get(resolved.coords.provider, resolved.coords.model);
    const prompt = reflectPrompt(sessionRows.map(toPromptRow), episodic, longRows.map(toPromptRow));
    const result = await completeOnce(binding, prompt);
    if (result === undefined || result.finishReason !== 'stop') {
      this.deps.logger.warn('memory reflect llm failed', {
        orgId,
        agentName: agent.name,
        finishReason: result?.finishReason,
      });
      return;
    }
    const candidates = sessionRows.map(sessionCandidateOf);
    const decisions = parseConsolidationVerdict(result.text ?? '', candidates);
    const counts = emptyCounts();
    await applyFactDecisions({
      db: this.deps.db,
      semantic: this.semantic,
      scopeId: { orgId, agentName: agent.name },
      context: longRows,
      candidates,
      decisions,
      counts,
      source: 'compaction',
      scopeOf: () => 'long',
    });
    this.reflects.save(orgId, agent.name, new Date(nowMs).toISOString());
    if (origin !== undefined) {
      this.appendEvent(origin, agent, counts, resolved.coords, result);
    }
  }

  private appendEvent(
    origin: ReflectOrigin,
    agent: AgentRecord,
    counts: AppliedCounts,
    coords: AgentModelCoords,
    result: CallModelResult,
  ): void {
    const usage: ModelUsage = usageOf(coords, result);
    appendConsolidationEvents(this.deps.events, {
      threadId: origin.threadId,
      runId: origin.runId,
      agentId: agent.id,
      counts,
      usage,
      subtype: 'memory.reflected',
    });
  }

  private async episodicHitsOf(orgId: string, agentId: string): Promise<EpisodicHit[]> {
    if (this.deps.episodic === undefined) {
      return [];
    }
    return this.deps.episodic.search({
      orgId,
      query: '',
      agentId,
      limit: MEMORY_REFLECT_EPISODIC_LIMIT,
    });
  }

  private factRowsOf(orgId: string, agentName: string, scope: 'session' | 'long'): MemoryFactRow[] {
    return this.deps.db
      .select()
      .from(memoryFactsTable)
      .where(
        and(
          eq(memoryFactsTable.orgId, orgId),
          eq(memoryFactsTable.agentName, agentName),
          eq(memoryFactsTable.scope, scope),
          isNull(memoryFactsTable.supersededBy),
        ),
      )
      .orderBy(desc(memoryFactsTable.updatedAt), asc(memoryFactsTable.id))
      .limit(MEMORY_REFLECT_FACTS_LIMIT)
      .all();
  }
}

function toPromptRow(row: MemoryFactRow): ReflectFactRow {
  return { id: row.id, text: row.text, key: row.key, importance: row.importance };
}

function sessionCandidateOf(row: MemoryFactRow): MemoryCandidate {
  return {
    text: row.text,
    scope: 'session',
    ...(row.key === null ? {} : { key: row.key }),
    importance: row.importance,
  };
}
