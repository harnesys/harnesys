import type { AgentPatch, AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import type {
  ThreadActiveRun,
  ThreadAgentRecord,
  ThreadInsert,
  ThreadParticipantRecord,
  ThreadParticipantRole,
  ThreadPatch,
  ThreadRecord,
} from '../../domain/thread/thread.ts';
import { toThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export function memoryThread(
  overrides: Partial<ThreadRecord> & Pick<ThreadRecord, 'id'>,
): ThreadRecord {
  const now = new Date().toISOString();
  return {
    orgId: 'org-1',
    title: 'test',
    kind: 'chat',
    autoReplyAgentId: null,
    policy: { version: 1 },
    lastThreadSeq: 0,
    conversationCount: 0,
    parentThreadId: null,
    forkAt: null,
    inheritedEventCount: 0,
    metadata: {},
    runProfileId: null,
    runDirectory: null,
    createdAt: now,
    updatedAt: now,
    lastReadAt: now,
    ...overrides,
  };
}

export class MemoryThreads extends ThreadRepositoryPort {
  readonly rows = new Map<string, ThreadRecord>();

  seed(record: ThreadRecord): ThreadRecord {
    this.rows.set(record.id, record);
    return record;
  }

  listByOrg(orgId: string): ThreadRecord[] {
    return [...this.rows.values()].filter((row) => row.orgId === orgId);
  }

  listActiveRuns(): ThreadActiveRun[] {
    return [];
  }

  findActiveRun(): ThreadActiveRun | undefined {
    return undefined;
  }

  findById(orgId: string, id: string): ThreadRecord | undefined {
    const row = this.rows.get(id);
    return row?.orgId === orgId ? row : undefined;
  }

  insert(rec: ThreadInsert): ThreadRecord {
    return this.seed(toThreadRecord(rec));
  }

  patch(orgId: string, id: string, patch: ThreadPatch): ThreadRecord {
    const row = this.findById(orgId, id);
    if (!row) {
      throw new Error(`thread not found: ${id}`);
    }
    const next = { ...row, ...patch, updatedAt: new Date().toISOString() };
    this.rows.set(id, next);
    return next;
  }

  markRead(orgId: string, id: string, at: string): ThreadRecord {
    return this.patch(orgId, id, { lastReadAt: at });
  }

  updateTitle(orgId: string, id: string, title: string): ThreadRecord {
    return this.patch(orgId, id, { title });
  }

  touch(): void {}

  delete(orgId: string, id: string): void {
    if (this.findById(orgId, id)) {
      this.rows.delete(id);
    }
  }

  deleteByAgent(): void {}

  listByIssue(): ThreadRecord[] {
    return [];
  }

  findByIssueAndAgent(): ThreadRecord | undefined {
    return undefined;
  }

  threadIdsWithRuns(): Set<string> {
    return new Set();
  }
}

export class MemoryThreadMembers extends ThreadAgentRepositoryPort {
  private readonly rows = new Map<string, Map<string, ThreadAgentRecord>>();

  listByThread(_orgId: string, threadId: string): ThreadAgentRecord[] {
    return [...(this.rows.get(threadId)?.values() ?? [])];
  }

  listByThreads(_orgId: string, threadIds: string[]): ThreadAgentRecord[] {
    return threadIds.flatMap((threadId) => this.listByThread(_orgId, threadId));
  }

  ensure(_orgId: string, threadId: string, agentId: string): ThreadAgentRecord {
    const members = this.rows.get(threadId) ?? new Map<string, ThreadAgentRecord>();
    const existing = members.get(agentId);
    if (existing) {
      return existing;
    }
    const record = { threadId, agentId, createdAt: new Date().toISOString() };
    members.set(agentId, record);
    this.rows.set(threadId, members);
    return record;
  }

  remove(_orgId: string, threadId: string, agentId: string): void {
    this.rows.get(threadId)?.delete(agentId);
  }

  listThreadIdsByAgent(_orgId: string, agentId: string): string[] {
    return [...this.rows.entries()]
      .filter(([, members]) => members.has(agentId))
      .map(([threadId]) => threadId);
  }
}

export class StubThreadParticipants extends ThreadParticipantRepositoryPort {
  listByThread(): ThreadParticipantRecord[] {
    return [];
  }

  findById(): ThreadParticipantRecord | undefined {
    return undefined;
  }

  findByUserId(): ThreadParticipantRecord | undefined {
    return undefined;
  }

  ensure(): ThreadParticipantRecord {
    throw new Error('not used');
  }

  setRole(_orgId: string, _threadId: string, _id: string, _role: ThreadParticipantRole): void {
    throw new Error('not used');
  }

  touchSeen(): void {}

  remove(): void {}
}

export class MemoryAgents extends AgentRegistryPort {
  private readonly rows = new Map<string, AgentRecord>();

  seed(agent: AgentRecord): AgentRecord {
    this.rows.set(agent.id, agent);
    return agent;
  }

  list(orgId: string): AgentRecord[] {
    return [...this.rows.values()].filter((row) => row.orgId === orgId);
  }

  findById(orgId: string, id: string): AgentRecord | undefined {
    const row = this.rows.get(id);
    return row?.orgId === orgId ? row : undefined;
  }

  findByName(orgId: string, name: string): AgentRecord | undefined {
    return this.list(orgId).find((row) => row.name === name);
  }

  insert(rec: AgentRecord): AgentRecord {
    return this.seed(rec);
  }

  update(orgId: string, id: string, patch: AgentPatch): AgentRecord {
    const row = this.findById(orgId, id);
    if (!row) {
      throw new Error(`agent not found: ${id}`);
    }
    const next = { ...row, ...patch };
    this.rows.set(id, next);
    return next;
  }

  delete(_orgId: string, id: string): void {
    this.rows.delete(id);
  }
}

export function memoryAgent(
  overrides: Partial<AgentRecord> & Pick<AgentRecord, 'id'>,
): AgentRecord {
  const now = new Date().toISOString();
  return {
    orgId: 'org-1',
    name: overrides.id,
    role: 'agent',
    instructions: '',
    modelId: 'model-1',
    budgetUsdDaily: null,
    level: 'delegate',
    parentId: null,
    executionProfileId: null,
    status: 'active',
    sharedSourceIds: [],
    sourceLevels: {},
    secretNames: [],
    skills: [],
    mcpServers: [],
    enabledPlugins: {},
    defaultModeId: null,
    config: {},
    hooks: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
