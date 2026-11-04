import {
  type CapabilityScope,
  clampSearchLimit,
  type EpisodicPort,
  type ManagerThreadTailItem,
  type RunEventStore,
  readThreadHistory,
  type SessionEvent,
  searchThreadHistory,
  snippetText,
  type ThreadHistoryPage,
  type ThreadHistoryQuery,
  type ThreadSearchQuery,
  type ThreadSearchResult,
  type ThreadSummary,
  type ThreadsPort,
} from 'harnesys';
import { AgentRegistryPort } from '../../../domain/agent/agent-registry.port.ts';
import { ManagerTailPort } from '../../../domain/manager/manager-tail.port.ts';
import { ScheduleRepositoryPort } from '../../../domain/schedule/schedule-repository.port.ts';
import { ThreadAgentRepositoryPort } from '../../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../../domain/thread/thread-repository.port.ts';

export interface OrgThreadsPortDeps {
  threads: ThreadRepositoryPort;
  threadAgents: ThreadAgentRepositoryPort;
  agents: AgentRegistryPort;
  schedules?: ScheduleRepositoryPort;
  events?: RunEventStore;
  episodic?: EpisodicPort;
  tail?: ManagerTailPort;
}

const TAIL_LIMIT_MAX = 100;

export class OrgThreadsPort implements ThreadsPort {
  constructor(private readonly deps: OrgThreadsPortDeps) {}

  list(scope: CapabilityScope): Promise<ThreadSummary[]> {
    const schedules = this.deps.schedules?.listByOrg(scope.orgId) ?? [];
    const occupied = new Set(schedules.map((row) => row.threadId));
    const rows = this.deps.threads.listByOrg(scope.orgId);
    const agentIdByThread = new Map<string, string>();
    for (const member of this.deps.threadAgents.listByThreads(
      scope.orgId,
      rows.map((row) => row.id),
    )) {
      if (!agentIdByThread.has(member.threadId)) {
        agentIdByThread.set(member.threadId, member.agentId);
      }
    }
    const items = rows.map((row) => {
      const agentId = agentIdByThread.get(row.id) ?? '';
      const agent = agentId ? this.deps.agents.findById(scope.orgId, agentId) : undefined;
      return {
        id: row.id,
        title: row.title,
        kind: row.kind,
        agentId,
        agentName: agent?.name ?? agentId,
        hasSchedule: occupied.has(row.id),
      };
    });
    return Promise.resolve(items);
  }

  async history(scope: CapabilityScope, query: ThreadHistoryQuery): Promise<ThreadHistoryPage> {
    const threadId = this.threadInOrg(scope, query.threadId);
    const events = await this.eventsOf(threadId);
    return readThreadHistory(events, threadId, query);
  }

  async search(scope: CapabilityScope, query: ThreadSearchQuery): Promise<ThreadSearchResult> {
    if (query.scope === 'org') {
      return await this.searchOrg(scope, query);
    }
    const threadId = this.threadInOrg(scope, query.threadId);
    const events = await this.eventsOf(threadId);
    return searchThreadHistory(events, threadId, query);
  }

  async tail(
    scope: CapabilityScope,
    threadId: string,
    limit: number,
  ): Promise<ManagerThreadTailItem[]> {
    const target = this.threadInOrg(scope, threadId);
    if (this.deps.tail === undefined) {
      throw new Error('threads_tail is unavailable: thread journal port is not configured');
    }
    const requested = Math.max(1, Math.min(limit, TAIL_LIMIT_MAX));
    return this.deps.tail.tail(scope.orgId, target, requested);
  }

  private async searchOrg(
    scope: CapabilityScope,
    query: ThreadSearchQuery,
  ): Promise<ThreadSearchResult> {
    if (this.deps.episodic === undefined) {
      throw new Error('threads_search scope=org is unavailable: episodic port is not configured');
    }
    const limit = clampSearchLimit(query.limit);
    const threadId =
      query.threadId === undefined ? undefined : this.threadInOrg(scope, query.threadId);
    const hits = await this.deps.episodic.search({
      orgId: scope.orgId,
      query: query.query,
      ...(threadId !== undefined ? { threadId } : {}),
      limit,
      conversationalOnly: true,
    });
    return {
      hits: hits.map((hit) => ({
        threadId: hit.threadId,
        threadSeq: hit.threadSeq ?? 0,
        role: hit.role ?? 'assistant',
        ...(hit.author !== undefined ? { author: hit.author } : {}),
        text: snippetText(hit.text, query.query),
      })),
      hasMore: hits.length >= limit,
    };
  }

  private threadInOrg(scope: CapabilityScope, explicitThreadId: string | undefined): string {
    const threadId = explicitThreadId ?? scope.threadId;
    if (this.deps.threads.findById(scope.orgId, threadId) === undefined) {
      throw new Error(`thread not found: ${threadId}`);
    }
    return threadId;
  }

  private async eventsOf(threadId: string): Promise<SessionEvent[]> {
    if (this.deps.events === undefined) {
      throw new Error('thread transcript is unavailable: run event store is not configured');
    }
    return await this.deps.events.listByThread(threadId);
  }
}
