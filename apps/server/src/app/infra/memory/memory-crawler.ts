import { Injectable, Logger, type ModuleDestroyHook, type ModuleInitHook } from '@harnesys/brix';
import { parseMemoryPolicy } from '@harnesys/contracts';
import { CONSOLE_LOGGER } from 'harnesys';
import { ConsolidateThreadUseCase } from '../../application/use-cases/memory/consolidate-thread.use-case.ts';
import { PromoteFactsUseCase } from '../../application/use-cases/memory/promote-facts.use-case.ts';
import { findDecisionModelCoords } from '../../application/use-cases/memory/promote-triage.ts';
import { ReflectThreadUseCase } from '../../application/use-cases/memory/reflect-thread.use-case.ts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { resolveProviderApiKey } from '../../domain/secret/provider-api-key.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { StudioEmbeddings } from '../knowledge/embeddings.ts';
import {
  type OrgSqliteDb,
  withOrgSqlite,
  withOrgSqliteAsync,
} from '../org-sqlite/org-sqlite-session.ts';
import { packsFromConfig } from '../runtime/agent-definition.mapper.ts';
import { createOrgModelsPort } from '../runtime/org-models.port.ts';
import { OrgEpisodicPort } from '../runtime/packs/org-episodic.port.ts';
import { SqliteRunEventStore } from '../runtime/sqlite-run-events.adapter.ts';
import {
  countFacts,
  countPromotions,
  latestRunIdOf,
  recentThreadsOf,
} from './memory-crawl-queries.ts';
import { OrgMemoryConsolidationStore } from './org-memory-consolidation.store.ts';
import { OrgMemoryReflectStore } from './org-memory-reflect.store.ts';
import {
  decisionModelIdOf,
  embedModelIdOf,
  memoryCrawlRecord,
  saveMemoryCrawlRecord,
} from './org-memory-settings.store.ts';

export const MEMORY_CRAWL_INTERVAL_MS = 6 * 3_600_000;
const MEMORY_CRAWL_FIRST_DELAY_MS = 60_000;

interface CrawlTotals {
  agents: number;
  threads: number;
  facts: number;
  reflections: number;
  promotions: number;
}
@Injectable()
export class MemoryCrawler implements ModuleInitHook, ModuleDestroyHook {
  private readonly log: Logger;
  private firstTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private pass: Promise<void> | undefined;

  constructor(
    private readonly orgs: OrgMachineStore,
    private readonly layout: HostFsLayoutPort,
    private readonly agents: AgentRegistryPort,
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly secrets: SecretStorePort,
    logger: Logger,
  ) {
    this.log = logger.child('memory-crawler');
  }

  onModuleInit(): void {
    this.firstTimer = setTimeout(() => {
      this.pass = this.runPass();
    }, MEMORY_CRAWL_FIRST_DELAY_MS);
    this.intervalTimer = setInterval(() => {
      if (!this.pass) {
        this.pass = this.runPass();
      }
    }, MEMORY_CRAWL_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.firstTimer) {
      clearTimeout(this.firstTimer);
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }
    await this.pass;
  }

  private async runPass(): Promise<void> {
    try {
      for (const entry of this.orgs.list()) {
        if (entry.role === 'relay') {
          continue;
        }
        try {
          await this.crawlOrg(entry.orgId);
        } catch (err) {
          this.log.warn({ orgId: entry.orgId, err: errorMessage(err) }, 'memory crawl org failed');
        }
      }
    } finally {
      this.pass = undefined;
    }
  }

  async runNow(orgId: string): Promise<void> {
    if (this.pass) {
      await this.pass;
      return;
    }
    this.log.info({ orgId, triggered: 'manual' }, 'memory crawl pass started');
    const run = this.crawlOrgPass(orgId)
      .then((summary) => {
        this.log.info({ orgId, summary }, 'memory crawl pass finished');
      })
      .finally(() => {
        this.pass = undefined;
      });
    this.pass = run;
    await run;
  }

  private async crawlOrg(orgId: string): Promise<void> {
    if (!crawlDue(orgId, this.layout, Date.now())) {
      return;
    }
    this.log.info({ orgId }, 'memory crawl pass started');
    const summary = await this.crawlOrgPass(orgId);
    this.log.info({ orgId, summary }, 'memory crawl pass finished');
  }

  private crawlOrgPass(orgId: string): Promise<string> {
    return withOrgSqliteAsync(this.layout, orgId, async (db) => {
      const nowMs = Date.now();
      const reflect = this.reflectOf(orgId, db);
      const promote = new PromoteFactsUseCase({
        db,
        agents: this.agents,
        logger: CONSOLE_LOGGER,
        models: createOrgModelsPort(orgId, this.providers, this.models, this.secrets),
        decisionCoords: () =>
          findDecisionModelCoords({
            orgId,
            providers: this.providers,
            models: this.models,
            decisionModelId: decisionModelIdOf(db, orgId),
          }),
      });
      const consolidate = this.consolidateOf(orgId, db, reflect, promote);
      const totals: CrawlTotals = {
        agents: 0,
        threads: 0,
        facts: 0,
        reflections: 0,
        promotions: 0,
      };
      for (const agent of this.crawlAgentsOf(orgId)) {
        totals.agents += 1;
        try {
          await this.crawlAgent(orgId, db, { agent, consolidate, reflect, promote, totals, nowMs });
        } catch (err) {
          this.log.warn(
            { orgId, agentName: agent.name, err: errorMessage(err) },
            'memory crawl agent failed',
          );
        }
      }
      const summary = summaryOf(totals);
      saveMemoryCrawlRecord(db, orgId, {
        lastCrawlAt: new Date(nowMs).toISOString(),
        lastCrawlSummary: summary,
      });
      return summary;
    });
  }

  private async crawlAgent(
    orgId: string,
    db: OrgSqliteDb,
    input: {
      agent: AgentRecord;
      consolidate: ConsolidateThreadUseCase;
      reflect: ReflectThreadUseCase;
      promote: PromoteFactsUseCase;
      totals: CrawlTotals;
      nowMs: number;
    },
  ): Promise<void> {
    const agentName = input.agent.name;
    const factsBefore = countFacts(db, orgId, agentName);
    const promotionsBefore = countPromotions(db, orgId, agentName);
    const reflects = new OrgMemoryReflectStore(db);
    const reflectedBefore = reflects.find(orgId, agentName);
    const cursors = new OrgMemoryConsolidationStore(db);
    for (const thread of recentThreadsOf(db, orgId, input.agent.id)) {
      const runId = latestRunIdOf(db, thread.id);
      if (runId === undefined) {
        continue;
      }
      const before = cursors.find(orgId, agentName, thread.id);
      await input.consolidate.execute(orgId, thread.id, runId);
      if (cursorMoved(before, cursors.find(orgId, agentName, thread.id))) {
        input.totals.threads += 1;
      }
    }
    await input.reflect.execute(orgId, input.agent, input.nowMs);
    await input.promote.execute(orgId, input.agent);
    input.totals.facts += Math.max(0, countFacts(db, orgId, agentName) - factsBefore);
    input.totals.promotions += Math.max(
      0,
      countPromotions(db, orgId, agentName) - promotionsBefore,
    );
    if (reflects.find(orgId, agentName) !== reflectedBefore) {
      input.totals.reflections += 1;
    }
  }

  private crawlAgentsOf(orgId: string): AgentRecord[] {
    return this.agents.list(orgId).filter((agent) => {
      if (agent.level === 'delegate') {
        return false;
      }
      if (!packsFromConfig(agent.config)['semantic-memory']) {
        return false;
      }
      return parseMemoryPolicy(agent.config.memoryPolicyJson)?.consolidate !== false;
    });
  }

  private consolidateOf(
    orgId: string,
    db: OrgSqliteDb,
    reflect: ReflectThreadUseCase,
    promote: PromoteFactsUseCase,
  ): ConsolidateThreadUseCase {
    return new ConsolidateThreadUseCase({
      db,
      models: createOrgModelsPort(orgId, this.providers, this.models, this.secrets),
      events: new SqliteRunEventStore(db),
      agents: this.agents,
      logger: CONSOLE_LOGGER,
      embeddings: this.embeddingsOf(orgId, db),
      agentModelCoords: (agent: AgentRecord) => this.coordsOf(orgId, agent.modelId),
      consolidateModelCoords: (modelId: string) => this.coordsOf(orgId, modelId),
      reflect,
      promote,
    });
  }

  private reflectOf(orgId: string, db: OrgSqliteDb): ReflectThreadUseCase {
    return new ReflectThreadUseCase({
      db,
      models: createOrgModelsPort(orgId, this.providers, this.models, this.secrets),
      events: new SqliteRunEventStore(db),
      logger: CONSOLE_LOGGER,
      embeddings: this.embeddingsOf(orgId, db),
      episodic: new OrgEpisodicPort(db),
      agentModelCoords: (agent: AgentRecord) => this.coordsOf(orgId, agent.modelId),
      consolidateModelCoords: (modelId: string) => this.coordsOf(orgId, modelId),
    });
  }

  private embeddingsOf(orgId: string, db: OrgSqliteDb): StudioEmbeddings {
    const embedModelId = embedModelIdOf(db, orgId);
    return new StudioEmbeddings({
      providers: this.providers,
      models: this.models,
      orgId,
      modelRef: embedModelId ? this.coordsOf(orgId, embedModelId) : undefined,
      resolveApiKey: (provider) =>
        resolveProviderApiKey(this.secrets, orgId, provider.id, provider.apiKey),
    });
  }

  private coordsOf(
    orgId: string,
    modelId: string,
  ): { provider: string; model: string } | undefined {
    const model = this.models.findById(orgId, modelId);
    const provider = model ? this.providers.findById(orgId, model.providerId) : undefined;
    return model && provider ? { provider: provider.name, model: model.name } : undefined;
  }
}

function crawlDue(orgId: string, layout: HostFsLayoutPort, nowMs: number): boolean {
  const last = withOrgSqlite(layout, orgId, (db) => memoryCrawlRecord(db, orgId));
  if (!last?.lastCrawlAt) {
    return true;
  }
  const lastMs = Date.parse(last.lastCrawlAt);
  if (!Number.isFinite(lastMs)) {
    return true;
  }
  return nowMs - lastMs >= MEMORY_CRAWL_INTERVAL_MS / 2;
}

function cursorMoved(
  before: { lastRunId: string; lastSeq: number } | undefined,
  after: { lastRunId: string; lastSeq: number } | undefined,
): boolean {
  if (before === undefined || after === undefined) {
    return before !== after;
  }
  return before.lastRunId !== after.lastRunId || before.lastSeq !== after.lastSeq;
}

function summaryOf(totals: CrawlTotals): string {
  return `${totals.agents} agents · ${totals.threads} threads consolidated · ${totals.facts} facts · ${totals.reflections} reflections · ${totals.promotions} promotions`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
