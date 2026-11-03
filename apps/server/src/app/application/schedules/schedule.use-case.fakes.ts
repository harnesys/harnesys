import type { OrgSettings } from '@harnesys/contracts';
import { OrgSettingsSchema } from '@harnesys/contracts';
import type { DeskEvent } from '@harnesys/studio-shared';
import type { AgentPatch, AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { type DeskEventListener, DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import type {
  ScheduleFireRecord,
  ScheduleInsert,
  SchedulePatch,
  ScheduleRecord,
} from '../../domain/schedule/schedule.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import type {
  ThreadActiveRun,
  ThreadAgentRecord,
  ThreadInsert,
  ThreadPatch,
  ThreadRecord,
} from '../../domain/thread/thread.ts';
import { toThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export class FakeSchedules extends ScheduleRepositoryPort {
  readonly items = new Map<string, ScheduleRecord>();

  listByOrg(orgId: string): ScheduleRecord[] {
    return [...this.items.values()].filter((record) => record.orgId === orgId);
  }

  listDue(): ScheduleRecord[] {
    return [];
  }

  findById(_orgId: string, id: string): ScheduleRecord | undefined {
    return this.items.get(id);
  }

  findByThreadId(): ScheduleRecord | undefined {
    return undefined;
  }

  listFiresBySchedule(): ScheduleFireRecord[] {
    return [];
  }

  insert(rec: ScheduleInsert): ScheduleRecord {
    this.items.set(rec.id, rec);
    return rec;
  }

  update(_orgId: string, id: string, patch: SchedulePatch): ScheduleRecord {
    const current = this.items.get(id);
    if (!current) {
      throw new Error(`schedule not found: ${id}`);
    }
    const next = { ...current, ...patch };
    this.items.set(id, next);
    return next;
  }

  delete(): void {}

  claimFire(): boolean {
    return true;
  }

  recordFireRun(): void {}

  releaseFire(): void {}
}

export class FakeThreads extends ThreadRepositoryPort {
  readonly items = new Map<string, ThreadRecord>();

  listByOrg(): ThreadRecord[] {
    return [...this.items.values()];
  }

  listActiveRuns(): ThreadActiveRun[] {
    return [];
  }

  findActiveRun(): ThreadActiveRun | undefined {
    return undefined;
  }

  findById(_orgId: string, id: string): ThreadRecord | undefined {
    return this.items.get(id);
  }

  insert(rec: ThreadInsert): ThreadRecord {
    const thread = toThreadRecord(rec);
    this.items.set(rec.id, thread);
    return thread;
  }

  patch(_orgId: string, id: string, patch: ThreadPatch): ThreadRecord {
    const current = this.items.get(id);
    if (!current) {
      throw new Error(`thread not found: ${id}`);
    }
    const next = { ...current, ...patch };
    this.items.set(id, next);
    return next;
  }

  markRead(): ThreadRecord {
    throw new Error('not implemented');
  }

  updateTitle(): ThreadRecord {
    throw new Error('not implemented');
  }

  touch(): void {}

  delete(): void {}

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

export class FakeThreadAgents implements ThreadAgentRepositoryPort {
  readonly items: ThreadAgentRecord[] = [];

  listByThread(_orgId: string, threadId: string): ThreadAgentRecord[] {
    return this.items.filter((record) => record.threadId === threadId);
  }

  listByThreads(_orgId: string, threadIds: string[]): ThreadAgentRecord[] {
    return this.items.filter((record) => threadIds.includes(record.threadId));
  }

  ensure(_orgId: string, threadId: string, agentId: string): ThreadAgentRecord {
    const found = this.items.find((record) => record.threadId === threadId);
    if (found) {
      return found;
    }
    const record = { threadId, agentId, createdAt: new Date().toISOString() };
    this.items.push(record);
    return record;
  }

  remove(_orgId: string, threadId: string, agentId: string): void {
    const index = this.items.findIndex(
      (record) => record.threadId === threadId && record.agentId === agentId,
    );
    if (index >= 0) {
      this.items.splice(index, 1);
    }
  }

  listThreadIdsByAgent(_orgId: string, agentId: string): string[] {
    return this.items
      .filter((record) => record.agentId === agentId)
      .map((record) => record.threadId);
  }
}

export class FakeAgents extends AgentRegistryPort {
  readonly items = new Map<string, AgentRecord>();

  list(orgId: string): AgentRecord[] {
    return [...this.items.values()].filter((record) => record.orgId === orgId);
  }

  findById(orgId: string, id: string): AgentRecord | undefined {
    return this.list(orgId).find((record) => record.id === id);
  }

  findByName(orgId: string, name: string): AgentRecord | undefined {
    return this.list(orgId).find((record) => record.name === name);
  }

  insert(rec: AgentRecord): AgentRecord {
    this.items.set(rec.id, rec);
    return rec;
  }

  update(_orgId: string, id: string, patch: AgentPatch): AgentRecord {
    const current = this.items.get(id);
    if (!current) {
      throw new Error(`agent not found: ${id}`);
    }
    const next = { ...current, ...patch };
    this.items.set(id, next);
    return next;
  }

  delete(_orgId: string, id: string): void {
    this.items.delete(id);
  }
}

export class FakeOrgSettings extends OrgSettingsPort {
  timezone = 'UTC';

  get(): OrgSettings {
    return OrgSettingsSchema.parse({ timezone: this.timezone });
  }

  set(_orgId: string, patch: Partial<OrgSettings>): OrgSettings {
    return OrgSettingsSchema.parse(patch);
  }
}

export class FakeDeskEvents extends DeskEventsPort {
  events: Array<{ orgId: string; event: DeskEvent }> = [];

  override emit(orgId: string, event: DeskEvent): void {
    this.events.push({ orgId, event });
  }

  override subscribe(_listener: DeskEventListener): () => void {
    return () => {};
  }
}
