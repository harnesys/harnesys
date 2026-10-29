import { DEFAULT_MODE_ID } from '@harnesys/contracts';
import type {
  CapabilityScope,
  PermissionMode,
  ScheduleCreatedRecord,
  ScheduleCreateInput,
  ScheduleHistory,
  SchedulePeekFire,
  SchedulePeekRecord,
  ScheduleRecord,
  SchedulerPort,
  ScheduleStatus,
  ScheduleUpdateInput,
} from 'harnesys';
import { PERMISSION_MODES } from 'harnesys';
import { isValidCron, nextCronRunAt } from '../../../application/schedules/cron-next.ts';
import { AgentNotFoundException } from '../../../domain/agent/agent.error.ts';
import type { AgentRegistryPort } from '../../../domain/agent/agent-registry.port.ts';
import {
  ScheduleNotFoundException,
  ScheduleValidationException,
} from '../../../domain/schedule/schedule.error.ts';
import type {
  SchedulePatch,
  ScheduleRecord as ServerScheduleRecord,
} from '../../../domain/schedule/schedule.ts';
import type { ScheduleRepositoryPort } from '../../../domain/schedule/schedule-repository.port.ts';
import type { OrgSettingsPort } from '../../../domain/skills/org-settings.port.ts';
import type { ThreadRecord } from '../../../domain/thread/thread.ts';
import type { ThreadRepositoryPort } from '../../../domain/thread/thread-repository.port.ts';

export interface OrgSchedulerPortDeps {
  schedules: ScheduleRepositoryPort;
  threads: ThreadRepositoryPort;
  agents: AgentRegistryPort;
  orgSettings: OrgSettingsPort;
}

export class OrgSchedulerPort implements SchedulerPort {
  constructor(private readonly deps: OrgSchedulerPortDeps) {}

  list(scope: CapabilityScope): Promise<ScheduleRecord[]> {
    return Promise.resolve(this.deps.schedules.listByOrg(scope.orgId).map(toPortRecord));
  }

  peek(scope: CapabilityScope, id: string, last = 1): Promise<SchedulePeekRecord> {
    const current = this.requireSchedule(scope.orgId, id);
    const limit = Math.min(Math.max(last, 1), 99);
    const fires: SchedulePeekFire[] = this.deps.schedules
      .listFiresBySchedule(scope.orgId, current.id)
      .slice(0, limit)
      .map((fire) => ({ at: fire.createdAt, detail: fire.runId ?? fire.fireId }));
    return Promise.resolve({
      id: current.id,
      name: current.name,
      threadId: current.threadId,
      lastFiredAt: current.lastFiredAt,
      fires,
    });
  }

  create(scope: CapabilityScope, input: ScheduleCreateInput): Promise<ScheduleCreatedRecord> {
    const name = input.name.trim();
    if (!name) {
      throw new ScheduleValidationException('schedule name cannot be empty');
    }
    const agentId = input.targetAgentId?.trim() || scope.agentId;
    const agent = this.deps.agents.findById(scope.orgId, agentId);
    if (!agent || agent.status === 'archived') {
      throw new AgentNotFoundException(agentId);
    }
    const cron = input.cron?.trim() || '0 * * * *';
    const timezone = this.timezoneOf(scope.orgId);
    if (!isValidCron(cron, timezone)) {
      throw new ScheduleValidationException('invalid cron');
    }
    const now = new Date().toISOString();
    const thread = input.threadId
      ? this.requireBindableThread(scope.orgId, agent.id, input.threadId)
      : this.deps.threads.insert({
          id: crypto.randomUUID(),
          orgId: scope.orgId,
          agentId: agent.id,
          originAgentId: agent.id,
          title: name,
          kind: 'schedule',
          parentThreadId: null,
          forkAt: null,
          inheritedEventCount: 0,
          metadata: {},
          runProfileId: null,
          runDirectory: null,
          createdAt: now,
          updatedAt: now,
          lastReadAt: now,
        });
    const schedule = this.deps.schedules.insert({
      id: crypto.randomUUID(),
      orgId: scope.orgId,
      name,
      status: 'active',
      targetAgentId: agent.id,
      detail: input.detail?.trim() || '',
      cron,
      modeId: input.mode ?? agent.defaultModeId ?? DEFAULT_MODE_ID,
      history: input.history ?? 'none',
      historyLast: clampHistoryLast(input.historyLast ?? 1),
      missPolicy: 'catch-up',
      threadId: thread.id,
      nextRunAt: nextCronRunAt(cron, new Date(now), timezone),
      lastFiredAt: null,
      createdByUserId: null,
      createdAt: now,
      updatedAt: now,
    });
    return Promise.resolve({
      schedule: toPortRecord(schedule),
      thread: { id: thread.id, title: thread.title, kind: thread.kind, agentId: thread.agentId },
    });
  }

  update(
    scope: CapabilityScope,
    id: string,
    patchInput: ScheduleUpdateInput,
  ): Promise<ScheduleRecord> {
    const current = this.requireSchedule(scope.orgId, id);
    const patch = buildSchedulePatch(
      this.deps.agents,
      scope.orgId,
      patchInput,
      this.timezoneOf(scope.orgId),
    );
    const updated = this.deps.schedules.update(scope.orgId, current.id, patch);
    if (patch.name !== undefined && patch.name !== current.name) {
      this.deps.threads.patch(scope.orgId, updated.threadId, { title: patch.name });
    }
    return Promise.resolve(toPortRecord(updated));
  }

  remove(scope: CapabilityScope, id: string): Promise<void> {
    const current = this.requireSchedule(scope.orgId, id);
    this.deps.schedules.delete(scope.orgId, current.id);
    const thread = this.deps.threads.findById(scope.orgId, current.threadId);
    if (thread?.kind === 'schedule') {
      this.deps.threads.delete(scope.orgId, thread.id);
    }
    return Promise.resolve();
  }

  private requireSchedule(orgId: string, id: string): ServerScheduleRecord {
    const current = this.deps.schedules.findById(orgId, id);
    if (!current) {
      throw new ScheduleNotFoundException(id);
    }
    return current;
  }

  private timezoneOf(orgId: string): string {
    return this.deps.orgSettings.get(orgId).timezone;
  }

  private requireBindableThread(orgId: string, agentId: string, threadId: string): ThreadRecord {
    const id = threadId.trim();
    if (!id) {
      throw new ScheduleValidationException('threadId cannot be empty');
    }
    const thread = this.deps.threads.findById(orgId, id);
    if (!thread || thread.orgId !== orgId) {
      throw new ScheduleValidationException('thread not found');
    }
    if (thread.agentId !== agentId) {
      throw new ScheduleValidationException('thread belongs to another agent');
    }
    const occupied = this.deps.schedules.findByThreadId(orgId, thread.id);
    if (occupied) {
      throw new ScheduleValidationException('thread already has a schedule');
    }
    return thread;
  }
}

function buildSchedulePatch(
  agents: AgentRegistryPort,
  orgId: string,
  patchInput: ScheduleUpdateInput,
  timezone: string,
): SchedulePatch {
  const patch: SchedulePatch = { updatedAt: new Date().toISOString() };
  applyPatchName(patch, patchInput.name);
  applyPatchStatus(patch, patchInput.status);
  applyPatchAgent(patch, agents, orgId, patchInput.targetAgentId);
  applyPatchDetail(patch, patchInput.detail);
  applyPatchCron(patch, patchInput.cron, timezone);
  applyPatchMode(patch, patchInput.mode);
  applyPatchHistory(patch, patchInput.history, patchInput.historyLast);
  return patch;
}

function applyPatchName(patch: SchedulePatch, name: string | undefined): void {
  if (name === undefined) {
    return;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ScheduleValidationException('schedule name cannot be empty');
  }
  patch.name = trimmed;
}

function applyPatchStatus(patch: SchedulePatch, status: ScheduleStatus | undefined): void {
  if (status !== undefined) {
    patch.status = status;
  }
}

function applyPatchAgent(
  patch: SchedulePatch,
  agents: AgentRegistryPort,
  orgId: string,
  targetAgentId: string | undefined,
): void {
  if (targetAgentId === undefined) {
    return;
  }
  const agent = agents.findById(orgId, targetAgentId);
  if (!agent || agent.status === 'archived') {
    throw new AgentNotFoundException(targetAgentId);
  }
  patch.targetAgentId = agent.id;
}

function applyPatchDetail(patch: SchedulePatch, detail: string | undefined): void {
  if (detail !== undefined) {
    patch.detail = detail.trim();
  }
}

function applyPatchCron(patch: SchedulePatch, cron: string | undefined, timezone: string): void {
  if (cron === undefined) {
    return;
  }
  const trimmed = cron.trim();
  if (!isValidCron(trimmed, timezone)) {
    throw new ScheduleValidationException('invalid cron');
  }
  patch.cron = trimmed;
  patch.nextRunAt = nextCronRunAt(trimmed, new Date(), timezone);
}

function applyPatchMode(patch: SchedulePatch, mode: PermissionMode | undefined): void {
  if (mode !== undefined) {
    patch.modeId = mode;
  }
}

function applyPatchHistory(
  patch: SchedulePatch,
  history: ScheduleHistory | undefined,
  historyLast: number | undefined,
): void {
  if (history !== undefined) {
    patch.history = history;
  }
  if (historyLast !== undefined) {
    patch.historyLast = clampHistoryLast(historyLast);
  }
}

function toPortRecord(row: ServerScheduleRecord): ScheduleRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    status: row.status,
    targetAgentId: row.targetAgentId,
    detail: row.detail,
    cron: row.cron,
    mode: toPermissionMode(row.modeId),
    history: row.history,
    historyLast: row.historyLast,
    threadId: row.threadId,
    nextRunAt: row.nextRunAt,
    lastFiredAt: row.lastFiredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPermissionMode(modeId: string): PermissionMode {
  return PERMISSION_MODES.find((mode) => mode === modeId) ?? 'ask';
}

function clampHistoryLast(value: number): number {
  return Math.min(Math.max(value, 1), 99);
}
