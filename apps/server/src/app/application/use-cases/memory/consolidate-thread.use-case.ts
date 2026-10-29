import { parseMemoryPolicy } from '@harnesys/contracts';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  type Logger,
  MEMORY_EXTRACTION_MAX_EVENTS,
  MEMORY_RECONCILE_FACTS_LIMIT,
  type ModelBinding,
  type ModelsPort,
  type ModelUsage,
  type RunEventStore,
  type SessionEvent,
} from 'harnesys';
import type { AgentRecord } from '../../../domain/agent/agent.ts';
import type { AgentRegistryPort } from '../../../domain/agent/agent-registry.port.ts';
import type { EmbeddingsPort } from '../../../infra/knowledge/embeddings.ts';
import { OrgMemoryConsolidationStore } from '../../../infra/memory/org-memory-consolidation.store.ts';
import type { OrgSqliteDb } from '../../../infra/org-sqlite/org-sqlite-session.ts';
import { memoryFactsTable } from '../../../infra/org-sqlite/schema/agent-memory.ts';
import { threadsTable } from '../../../infra/org-sqlite/schema/threads.ts';
import { packsFromConfig } from '../../../infra/runtime/agent-definition.mapper.ts';
import { OrgSemanticPort } from '../../../infra/runtime/packs/org-semantic.port.ts';
import { parseExtractionFacts } from './consolidate-thread-model.helpers.ts';
import {
  type AgentModelCoords,
  type AgentModelCoordsResolver,
  type AppliedCounts,
  appendConsolidationEvents,
  applyFactDecisions,
  type ConsolidateModelCoordsResolver,
  completeOnce,
  emptyCounts,
  extractionPrompt,
  type FactContextRow,
  reconcilePrompt,
  resolveCoords,
  usageOf,
} from './consolidate-thread-model.ts';
import {
  type ConsolidationDecision,
  type MemoryCandidate,
  parseConsolidationVerdict,
  pendingEventsOf,
} from './consolidation-decisions.ts';
import type { PromoteFactsUseCase } from './promote-facts.use-case.ts';
import type { ReflectThreadUseCase } from './reflect-thread.use-case.ts';

export interface ConsolidateThreadDeps {
  db: OrgSqliteDb;
  models: ModelsPort;
  events: RunEventStore;
  agents: AgentRegistryPort;
  logger: Logger;
  embeddings?: EmbeddingsPort;
  agentModelCoords?: AgentModelCoordsResolver;
  consolidateModelCoords?: ConsolidateModelCoordsResolver;
  reflect?: ReflectThreadUseCase;
  promote?: PromoteFactsUseCase;
}

export class ConsolidateThreadUseCase {
  private readonly semantic: OrgSemanticPort;
  private readonly cursors: OrgMemoryConsolidationStore;

  constructor(private readonly deps: ConsolidateThreadDeps) {
    this.semantic = new OrgSemanticPort(deps.db, deps.embeddings);
    this.cursors = new OrgMemoryConsolidationStore(deps.db);
  }

  async execute(orgId: string, threadId: string, runId: string): Promise<void> {
    try {
      await this.run(orgId, threadId, runId);
    } catch (err) {
      this.deps.logger.warn('memory consolidation failed', {
        orgId,
        threadId,
        runId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async run(orgId: string, threadId: string, runId: string): Promise<void> {
    const agent = this.agentOf(orgId, threadId);
    if (agent === undefined) {
      return;
    }
    const policy = parseMemoryPolicy(agent.config.memoryPolicyJson);
    if (policy?.consolidate === false) {
      return;
    }
    const pending = await this.pendingOf(orgId, agent, threadId);
    if (pending.length === 0) {
      return;
    }
    const window = windowOf(pending);
    if (window.consumed.length < pending.length) {
      this.deps.logger.warn('consolidation backlog', {
        orgId,
        threadId,
        runId,
        consolidation_backlog: { total: pending.length, consumed: window.consumed.length },
      });
    }
    const resolved = resolveCoords(
      agent,
      policy?.consolidateModelId,
      this.deps.agentModelCoords,
      this.deps.consolidateModelCoords,
    );
    if (resolved === null) {
      this.deps.logger.warn('memory consolidation skipped: no model', { orgId, threadId, runId });
      return;
    }
    if (resolved.overrideFailed) {
      this.deps.logger.warn('consolidation model override unresolvable, using agent model', {
        orgId,
        threadId,
        runId,
        consolidateModelId: policy?.consolidateModelId,
      });
    }
    const coords = resolved.coords;
    const binding = await this.deps.models.get(coords.provider, coords.model);
    const extraction = await completeOnce(binding, extractionPrompt(window.consumed));
    if (extraction === undefined || extraction.finishReason !== 'stop') {
      this.deps.logger.warn('memory extraction failed', {
        orgId,
        threadId,
        runId,
        finishReason: extraction?.finishReason,
      });
      return;
    }
    const candidates = parseExtractionFacts(extraction.text ?? '');
    const usage = usageOf(coords, extraction);
    const decisions = await this.decideOf({
      binding,
      coords,
      orgId,
      agentName: agent.name,
      threadId,
      runId,
      candidates,
      usage,
    });
    if (decisions === undefined) {
      return;
    }
    const counts = await this.apply(orgId, agent, threadId, candidates, decisions);
    const last = window.consumed[window.consumed.length - 1];
    appendConsolidationEvents(this.deps.events, {
      threadId,
      runId,
      agentId: agent.id,
      counts,
      usage,
    });
    this.cursors.save({
      orgId,
      agentName: agent.name,
      threadId,
      lastRunId: last?.runId ?? '',
      lastSeq: last?.seq ?? 0,
      updatedAt: new Date().toISOString(),
    });
    await this.chainMemoryPasses({ orgId, agent, threadId, runId, counts });
  }

  private async chainMemoryPasses(input: {
    orgId: string;
    agent: AgentRecord;
    threadId: string;
    runId: string;
    counts: AppliedCounts;
  }): Promise<void> {
    if (input.counts.added + input.counts.updated === 0) {
      return;
    }
    try {
      await this.deps.reflect?.execute(input.orgId, input.agent, Date.now(), {
        threadId: input.threadId,
        runId: input.runId,
      });
    } catch (err) {
      this.warnPassFailed(input.orgId, 'reflect', err);
    }
    try {
      await this.deps.promote?.execute(input.orgId, input.agent);
    } catch (err) {
      this.warnPassFailed(input.orgId, 'promote', err);
    }
  }

  private warnPassFailed(orgId: string, pass: string, err: unknown): void {
    this.deps.logger.warn(`memory ${pass} failed`, {
      orgId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  private agentOf(orgId: string, threadId: string): AgentRecord | undefined {
    const thread = this.deps.db
      .select()
      .from(threadsTable)
      .where(eq(threadsTable.id, threadId))
      .get();
    if (!thread) {
      return undefined;
    }
    const agent = this.deps.agents.findById(orgId, thread.agentId);
    if (!agent || agent.level === 'delegate') {
      return undefined;
    }
    if (!packsFromConfig(agent.config)['semantic-memory']) {
      return undefined;
    }
    return agent;
  }

  private async pendingOf(
    orgId: string,
    agent: AgentRecord,
    threadId: string,
  ): Promise<SessionEvent[]> {
    const cursor = this.cursors.find(orgId, agent.name, threadId);
    const threadEvents = await this.deps.events.listByThread(threadId);
    return pendingEventsOf(threadEvents, cursor);
  }

  private async decideOf(input: {
    binding: ModelBinding;
    coords: AgentModelCoords;
    orgId: string;
    agentName: string;
    threadId: string;
    runId: string;
    candidates: MemoryCandidate[];
    usage: ModelUsage;
  }): Promise<ConsolidationDecision[] | undefined> {
    if (input.candidates.length === 0) {
      return [];
    }
    const context = this.reconcileContextOf(input.orgId, input.agentName);
    const reconcile = await completeOnce(input.binding, reconcilePrompt(input.candidates, context));
    if (reconcile === undefined || reconcile.finishReason !== 'stop') {
      this.deps.logger.warn('memory reconcile failed', {
        orgId: input.orgId,
        threadId: input.threadId,
        runId: input.runId,
        finishReason: reconcile?.finishReason,
      });
      return undefined;
    }
    const reconcileUsage = usageOf(input.coords, reconcile);
    input.usage.promptTokens += reconcileUsage.promptTokens;
    input.usage.generatedTokens += reconcileUsage.generatedTokens;
    return parseConsolidationVerdict(reconcile.text ?? '', input.candidates);
  }

  private reconcileContextOf(orgId: string, agentName: string): FactContextRow[] {
    return this.deps.db
      .select({
        id: memoryFactsTable.id,
        text: memoryFactsTable.text,
        key: memoryFactsTable.key,
      })
      .from(memoryFactsTable)
      .where(
        and(
          eq(memoryFactsTable.orgId, orgId),
          eq(memoryFactsTable.agentName, agentName),
          eq(memoryFactsTable.scope, 'long'),
          isNull(memoryFactsTable.supersededBy),
        ),
      )
      .orderBy(desc(memoryFactsTable.updatedAt))
      .limit(MEMORY_RECONCILE_FACTS_LIMIT)
      .all();
  }

  private async apply(
    orgId: string,
    agent: AgentRecord,
    threadId: string,
    candidates: MemoryCandidate[],
    decisions: ConsolidationDecision[],
  ): Promise<AppliedCounts> {
    const counts = emptyCounts();
    await applyFactDecisions({
      db: this.deps.db,
      semantic: this.semantic,
      scopeId: { orgId, agentName: agent.name, threadId },
      context: this.reconcileContextOf(orgId, agent.name),
      candidates,
      decisions,
      counts,
      source: 'agent',
      scopeOf: (candidate) => candidate.scope,
    });
    return counts;
  }
}

function windowOf(pending: SessionEvent[]): { consumed: SessionEvent[] } {
  return {
    consumed:
      pending.length <= MEMORY_EXTRACTION_MAX_EVENTS
        ? pending
        : pending.slice(0, MEMORY_EXTRACTION_MAX_EVENTS),
  };
}
