import { Inject, Injectable, Logger } from '@harnesys/brix';
import { JobDescriptorSchema } from '@harnesys/sdk';
import { Cron } from 'croner';
import { AddonCallPort } from '../../../domain/addons/ports/addon-call.port.ts';
import { ContributionRegistryPort } from '../../../domain/addons/ports/contribution-registry.port.ts';
import { JobStateRepositoryPort } from '../../../domain/addons/ports/job-state-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';

type JobSchedule = { cron: string } | { everySec: number };

const DEFAULT_TIMEOUT_SEC = 900;
const MAX_TIMEOUT_SEC = 3600;

interface ScheduledHandle {
  stop(): void;
}

@Injectable()
export class AddonJobScheduler {
  private readonly logger: Logger;
  private readonly handles = new Map<string, ScheduledHandle>();
  private readonly inflight = new Set<string>();

  constructor(
    private readonly jobs: JobStateRepositoryPort,
    private readonly registry: ContributionRegistryPort,
    private readonly calls: AddonCallPort,
    private readonly clock: ClockPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-jobs');
  }

  start(): void {
    for (const state of this.jobs.listAll()) {
      const descriptor = this.descriptorOf(state.orgId, state.addonId, state.jobId);
      if (!descriptor || !state.enabled) {
        continue;
      }
      this.reschedule(state.orgId, state.addonId, state.jobId, descriptor.schedule);
      if (
        descriptor.catchUp === 'once' &&
        state.nextRunAt !== null &&
        state.nextRunAt < this.clock.now()
      ) {
        void this.runOnce(state.orgId, state.addonId, state.jobId);
      }
    }
  }

  stop(): void {
    for (const handle of this.handles.values()) {
      handle.stop();
    }
    this.handles.clear();
  }

  patch(orgId: string, addonId: string, jobId: string, enabled: boolean): void {
    this.jobs.setEnabled(orgId, addonId, jobId, enabled);
    const key = this.key(orgId, addonId, jobId);
    this.handles.get(key)?.stop();
    this.handles.delete(key);
    if (enabled) {
      const descriptor = this.descriptorOf(orgId, addonId, jobId);
      if (descriptor) {
        this.reschedule(orgId, addonId, jobId, descriptor.schedule);
      }
    }
  }

  async runNow(orgId: string, addonId: string, jobId: string): Promise<string | null> {
    const descriptor = this.descriptorOf(orgId, addonId, jobId);
    if (!descriptor) {
      const error = new Error(`Job is not declared by the addon: ${jobId}`);
      this.logger.warn({ orgId, addonId, jobId }, error.message);
      throw error;
    }
    await this.runOnce(orgId, addonId, jobId);
    const state = this.jobs.find(orgId, addonId, jobId);
    return state?.lastStatus ?? null;
  }

  private reschedule(orgId: string, addonId: string, jobId: string, schedule: JobSchedule): void {
    const key = this.key(orgId, addonId, jobId);
    this.handles.get(key)?.stop();
    if ('cron' in schedule) {
      const cron = new Cron(schedule.cron, { timezone: 'UTC' }, () => {
        void this.runOnce(orgId, addonId, jobId);
      });
      this.handles.set(key, { stop: () => cron.stop() });
      return;
    }
    const timer = setInterval(() => {
      void this.runOnce(orgId, addonId, jobId);
    }, schedule.everySec * 1000);
    this.handles.set(key, { stop: () => clearInterval(timer) });
  }

  private async runOnce(orgId: string, addonId: string, jobId: string): Promise<void> {
    const key = this.key(orgId, addonId, jobId);
    if (this.inflight.has(key)) {
      return;
    }
    this.inflight.add(key);
    const ranAt = this.clock.now();
    let status: string | null = 'ok';
    try {
      const descriptor = this.descriptorOf(orgId, addonId, jobId);
      const timeoutMs =
        Math.min(descriptor?.timeoutSec ?? DEFAULT_TIMEOUT_SEC, MAX_TIMEOUT_SEC) * 1000;
      await this.calls.jobRun(orgId, addonId, { jobId }, { timeoutMs });
    } catch (error) {
      status = error instanceof Error ? `error: ${error.message}` : 'error';
      this.logger.warn({ orgId, addonId, jobId, status }, 'addon job failed');
    } finally {
      this.inflight.delete(key);
    }
    this.jobs.recordRun(orgId, addonId, jobId, ranAt, status);
    this.writeNextRunAt(orgId, addonId, jobId);
  }

  private writeNextRunAt(orgId: string, addonId: string, jobId: string): void {
    const descriptor = this.descriptorOf(orgId, addonId, jobId);
    const state = this.jobs.find(orgId, addonId, jobId);
    if (!state || !descriptor) {
      return;
    }
    const nextRunAt = this.nextRunAt(descriptor, this.clock.now());
    this.jobs.upsert({ ...state, nextRunAt });
  }

  private nextRunAt(descriptor: JobDescriptorLike, now: number): number | null {
    if ('cron' in descriptor.schedule) {
      const job = new Cron(descriptor.schedule.cron, { timezone: 'UTC', paused: true });
      const next = job.nextRun(new Date(now + 1));
      job.stop();
      return next ? next.getTime() : null;
    }
    return now + descriptor.schedule.everySec * 1000;
  }

  private descriptorOf(orgId: string, addonId: string, jobId: string): JobDescriptorLike | null {
    const record = this.registry
      .contributions(orgId, 'job')
      .find((entry) => entry.owner.addonId === addonId && entry.descriptor.id === jobId);
    if (!record) {
      return null;
    }
    const parsed = JobDescriptorSchema.safeParse(record.descriptor);
    return parsed.success ? parsed.data : null;
  }

  private key(orgId: string, addonId: string, jobId: string): string {
    return `${orgId}/${addonId}/${jobId}`;
  }
}

interface JobDescriptorLike {
  schedule: JobSchedule;
  timeoutSec?: number;
  catchUp: 'none' | 'once';
}
