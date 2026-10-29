import { parseMemoryPolicy } from '@harnesys/contracts';
import { and, asc, desc, eq, gte, isNull } from 'drizzle-orm';
import type { Logger, ModelsPort } from 'harnesys';
import { MEMORY_PROMOTE_CANDIDATES_LIMIT } from 'harnesys';
import type { AgentRecord } from '../../../domain/agent/agent.ts';
import type { AgentRegistryPort } from '../../../domain/agent/agent-registry.port.ts';
import { OrgMemoryPromotionStore } from '../../../infra/memory/org-memory-promotion.store.ts';
import type { OrgSqliteDb } from '../../../infra/org-sqlite/org-sqlite-session.ts';
import { memoryFactsTable } from '../../../infra/org-sqlite/schema/agent-memory.ts';
import { completeOnce } from './consolidate-thread-model.ts';
import {
  type DecisionModelCoordsResolver,
  type PromoteCandidate,
  parseTriageVerdict,
  triagePrompt,
} from './promote-triage.ts';

export interface PromoteFactsDeps {
  db: OrgSqliteDb;
  agents: AgentRegistryPort;
  logger: Logger;
  models?: ModelsPort;
  decisionCoords?: DecisionModelCoordsResolver;
}

export class PromoteFactsUseCase {
  private readonly promotions: OrgMemoryPromotionStore;

  constructor(private readonly deps: PromoteFactsDeps) {
    this.promotions = new OrgMemoryPromotionStore(deps.db);
  }

  async execute(orgId: string, agent: AgentRecord): Promise<void> {
    const policy = parseMemoryPolicy(agent.config.memoryPolicyJson);
    if (policy?.promote !== true) {
      return;
    }
    const facts = this.candidateFactsOf(orgId, agent.name, policy.promoteThreshold ?? 8);
    if (facts.length === 0) {
      return;
    }
    const promoted = await this.triageOf(orgId, agent.name, facts);
    const now = new Date().toISOString();
    for (const factId of promoted) {
      this.promotions.insertPending({
        id: crypto.randomUUID(),
        orgId,
        agentName: agent.name,
        factId,
        createdAt: now,
      });
    }
    this.deps.logger.info('memory promotions queued', {
      orgId,
      agentName: agent.name,
      count: promoted.length,
    });
  }

  private async triageOf(
    orgId: string,
    agentName: string,
    facts: PromoteCandidate[],
  ): Promise<string[]> {
    const allIds = facts.map((fact) => fact.id);
    const coords = this.deps.decisionCoords?.();
    if (coords === undefined || this.deps.models === undefined) {
      return allIds;
    }
    try {
      const binding = await this.deps.models.get(coords.provider, coords.model);
      const result = await completeOnce(binding, triagePrompt(facts));
      if (result === undefined || result.finishReason !== 'stop') {
        this.warnTriageFallback(
          orgId,
          agentName,
          `finish reason ${result?.finishReason ?? 'absent'}`,
        );
        return allIds;
      }
      const selected = parseTriageVerdict(result.text ?? '', allIds);
      if (selected === undefined) {
        this.warnTriageFallback(orgId, agentName, 'unparsable verdict');
        return allIds;
      }
      this.deps.logger.info('memory promotion triage', {
        orgId,
        agentName,
        kept: selected.length,
        dropped: allIds.length - selected.length,
        decisionProvider: coords.provider,
        decisionModel: coords.model,
      });
      return selected;
    } catch (err) {
      this.warnTriageFallback(orgId, agentName, err instanceof Error ? err.message : String(err));
      return allIds;
    }
  }

  private warnTriageFallback(orgId: string, agentName: string, reason: string): void {
    this.deps.logger.warn('memory promotion triage fallback: promoting all candidates', {
      orgId,
      agentName,
      reason,
    });
  }

  private candidateFactsOf(
    orgId: string,
    agentName: string,
    threshold: number,
  ): PromoteCandidate[] {
    return this.deps.db
      .select({ id: memoryFactsTable.id, text: memoryFactsTable.text })
      .from(memoryFactsTable)
      .where(
        and(
          eq(memoryFactsTable.orgId, orgId),
          eq(memoryFactsTable.agentName, agentName),
          eq(memoryFactsTable.scope, 'long'),
          isNull(memoryFactsTable.supersededBy),
          gte(memoryFactsTable.importance, threshold),
        ),
      )
      .orderBy(desc(memoryFactsTable.updatedAt), asc(memoryFactsTable.id))
      .limit(MEMORY_PROMOTE_CANDIDATES_LIMIT)
      .all()
      .map((row) => ({ id: row.id, text: row.text }));
  }
}
