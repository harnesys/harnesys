import { Injectable, Logger, type ModuleDestroyHook, type ModuleInitHook } from '@harnesys/brix';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { planDueBatch } from '../../domain/schedule/planner.ts';
import {
  PLANNER_INTERVAL_MS,
  SCHEDULE_CATCHUP_BATCH,
  SCHEDULE_CATCHUP_WINDOW_SEC,
  type ScheduleRecord,
} from '../../domain/schedule/schedule.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { resolveRunPlacement } from '../threads/resolve-run-placement.ts';
import { FireScheduleUseCase } from './fire-schedule.use-case.ts';

@Injectable()
export class TickSchedulesUseCase implements ModuleInitHook, ModuleDestroyHook {
  private readonly log: Logger;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly orgs: OrgMachineStore,
    private readonly schedules: ScheduleRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly profiles: ExecutionProfilePort,
    private readonly machineConfig: MachineConfigPort,
    private readonly hub: FleetHubPort,
    private readonly claims: EventClaimPort,
    private readonly approvals: ApprovalStorePort,
    private readonly fireSchedule: FireScheduleUseCase,
    logger: Logger,
  ) {
    this.log = logger.child('schedule-planner');
  }

  onModuleInit(): void {
    if (this.timer) {
      return;
    }
    void this.execute(new Date());
    this.timer = setInterval(() => {
      void this.execute(new Date());
    }, PLANNER_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async execute(now: Date = new Date()): Promise<void> {
    const localHostId = this.machineConfig.get().id;
    for (const entry of this.orgs.list()) {
      try {
        await this.tickOrg(entry.orgId, localHostId, now);
      } catch (err) {
        this.log.warn(
          {
            orgId: entry.orgId,
            err: err instanceof Error ? err.message : String(err),
          },
          'planner tick failed',
        );
      }
    }
  }

  private async tickOrg(orgId: string, localHostId: string, now: Date): Promise<void> {
    const due = this.schedules.listDue(orgId, now.toISOString());
    if (due.length === 0) {
      return;
    }
    const { planned } = planDueBatch(due, {
      now,
      catchupWindowSec: SCHEDULE_CATCHUP_WINDOW_SEC,
      catchupBatch: SCHEDULE_CATCHUP_BATCH,
      dueAtOf: (row) => new Date(row.nextRunAt ?? 0),
      onlineOf: (row) => this.isCapableHostOnline(orgId, row, localHostId, now),
      missPolicyOf: (row) => row.missPolicy,
      scheduleIdOf: (row) => row.id,
    });
    for (const { row, decision } of planned) {
      if (decision.action === 'wait') {
        continue;
      }
      if (decision.action === 'fire' && decision.fireId) {
        const scheduledFor = row.nextRunAt ? new Date(row.nextRunAt) : now;
        const expiresAt = new Date(
          scheduledFor.getTime() + SCHEDULE_CATCHUP_WINDOW_SEC * 1000,
        ).toISOString();
        await this.fireSchedule.execute({
          orgId,
          fireId: decision.fireId,
          scheduleId: row.id,
          expiresAt,
        });
        this.fireSchedule.advance(orgId, row, now);
        continue;
      }
      if (decision.needsInbox) {
        this.openMissInbox(orgId, row, decision.action);
      }
      this.fireSchedule.advance(orgId, row, now);
    }
  }

  private isCapableHostOnline(
    orgId: string,
    schedule: ScheduleRecord,
    _localHostId: string,
    _now: Date,
  ): boolean {
    const agent = this.agents.findById(orgId, schedule.targetAgentId);
    if (!agent || agent.status === 'archived') {
      return false;
    }
    try {
      const decision = resolveRunPlacement({
        orgId,
        runId: 'schedule-preflight',
        agentProfileId: agent.executionProfileId,
        profiles: this.profiles,
        hub: this.hub,
        claims: this.claims,
      });
      return decision.kind === 'selected';
    } catch {
      return false;
    }
  }

  private openMissInbox(
    orgId: string,
    schedule: ScheduleRecord,
    reason: 'miss_stale' | 'miss_offline' | 'fire' | 'wait',
  ): void {
    if (reason !== 'miss_stale' && reason !== 'miss_offline') {
      return;
    }
    const interruptId = `schedule-miss:${schedule.id}:${schedule.nextRunAt ?? 'none'}`;
    this.approvals.request(orgId, {
      runId: crypto.randomUUID(),
      agentId: schedule.targetAgentId,
      threadId: schedule.threadId,
      interruptId,
      kind: 'question',
      question: `Schedule "${schedule.name}" missed (${reason === 'miss_stale' ? 'stale' : 'offline'})`,
      options: ['approve', 'deny'],
      context: {
        source: 'schedule',
        note: reason,
        tool: { name: 'schedule.miss', inputPreview: schedule.cron },
      },
    });
  }
}

export { PLANNER_INTERVAL_MS };
