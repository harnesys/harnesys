import { Injectable, Logger } from '@harnesys/brix';
import { scheduledTaskText } from '@harnesys/studio-shared';
import type { ScheduleRecord } from '../../domain/schedule/schedule.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import {
  RunConflictException,
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { mechanicalRunStart } from '../threads/run-attribution.ts';
import { SendThreadRunUseCase } from '../threads/send-thread-run.use-case.ts';
import { nextCronRunAt } from './cron-next.ts';

export type FireScheduleResult =
  | { status: 'fired'; runId: string }
  | { status: 'already_fired' }
  | { status: 'unknown_schedule' }
  | { status: 'thread_busy' }
  | { status: 'schedule_disabled' }
  | { status: 'failed' };

export interface FireScheduleRequest {
  orgId: string;
  fireId: string;
  scheduleId: string;
  expiresAt?: string;
}

@Injectable()
export class FireScheduleUseCase {
  private readonly log: Logger;

  constructor(
    private readonly schedules: ScheduleRepositoryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadEvents: ThreadEventsPort,
    private readonly sendThreadRun: SendThreadRunUseCase,
    private readonly orgSettings: OrgSettingsPort,
    logger: Logger,
  ) {
    this.log = logger.child('fire-schedule');
  }

  async execute(request: FireScheduleRequest): Promise<FireScheduleResult> {
    const schedule = this.schedules.findById(request.orgId, request.scheduleId);
    if (!schedule) {
      return { status: 'unknown_schedule' };
    }
    if (schedule.status !== 'active') {
      return { status: 'schedule_disabled' };
    }
    if (!this.schedules.claimFire(request.orgId, request.fireId, schedule.id)) {
      return { status: 'already_fired' };
    }
    try {
      const accepted = await this.sendThreadRun.execute({
        orgId: request.orgId,
        threadId: schedule.threadId,
        body: {
          text: scheduledTaskText(schedule.name, schedule.detail),
          mode: schedule.modeId,
          correlationId: request.fireId,
        },
        attribution: mechanicalRunStart(schedule.createdByUserId),
        trigger: { kind: 'schedule', id: request.fireId },
        expiresAt: request.expiresAt ?? null,
      });
      this.schedules.recordFireRun(request.orgId, request.fireId, accepted.runId);
      const now = new Date().toISOString();
      this.schedules.update(request.orgId, schedule.id, {
        lastFiredAt: now,
        updatedAt: now,
      });
      this.clearThreadLaunchError(request.orgId, schedule.threadId, accepted.runId);
      this.threads.touch(request.orgId, schedule.threadId);
      return { status: 'fired', runId: accepted.runId };
    } catch (error) {
      this.schedules.releaseFire(request.orgId, request.fireId);
      if (error instanceof RunConflictException) {
        return { status: 'thread_busy' };
      }
      if (cannotStart(error)) {
        this.disableSchedule(request.orgId, schedule);
        return { status: 'schedule_disabled' };
      }
      const message = error instanceof Error ? error.message : String(error);
      this.log.warn(
        {
          orgId: request.orgId,
          scheduleId: schedule.id,
          err: message,
        },
        'schedule fire failed',
      );
      this.recordThreadLaunchError(request.orgId, schedule.threadId, message);
      return { status: 'failed' };
    }
  }

  advance(orgId: string, schedule: ScheduleRecord, now: Date): ScheduleRecord {
    let nextRunAt: string | null = null;
    let status = schedule.status;
    try {
      nextRunAt = nextCronRunAt(schedule.cron, now, this.orgSettings.get(orgId).timezone);
    } catch {
      status = 'failed';
      this.log.warn({ orgId, scheduleId: schedule.id }, 'invalid cron, schedule failed');
    }
    return this.schedules.update(orgId, schedule.id, {
      nextRunAt,
      status,
      updatedAt: now.toISOString(),
    });
  }

  private disableSchedule(orgId: string, schedule: ScheduleRecord): void {
    try {
      this.schedules.update(orgId, schedule.id, {
        status: 'failed',
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // ignore
    }
  }

  private recordThreadLaunchError(orgId: string, threadId: string, message: string): void {
    const thread = this.threads.findById(orgId, threadId);
    if (!thread) {
      return;
    }
    const at = new Date().toISOString();
    const runId = `launch:${threadId}:${at}`;
    this.threads.patch(orgId, threadId, {
      metadata: { ...thread.metadata, lastError: { runId, message, at } },
    });
    this.threads.touch(orgId, threadId);
    this.threadEvents.emit(orgId, { type: 'failed', threadId, runId, message, at });
  }

  private clearThreadLaunchError(orgId: string, threadId: string, runId: string): void {
    const thread = this.threads.findById(orgId, threadId);
    if (!thread || thread.metadata.lastError === undefined) {
      return;
    }
    const { lastError: _dropped, ...metadata } = thread.metadata;
    this.threads.patch(orgId, threadId, { metadata });
    this.threadEvents.emit(orgId, { type: 'cleared', threadId, runId });
  }
}

function cannotStart(error: unknown): boolean {
  if (error instanceof ThreadNotFoundException) {
    return true;
  }
  return error instanceof ThreadValidationException && error.message === 'agent has no model';
}
