import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { JobDescriptor } from '@harnesys/sdk';
import { Cron } from 'croner';
import type { Disposable, OwnerKey } from '../../../domain/addons/owner.ts';
import { AddonCallPort } from '../../../domain/addons/ports/addon-call.port.ts';
import { JobStateRepositoryPort } from '../../../domain/addons/ports/job-state-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';

type JobSchedule = { cron: string } | { everySec: number };

const DEFAULT_TIMEOUT_SEC = 900;
const MAX_TIMEOUT_SEC = 3600;

interface ScheduledHandle {
  stop(): void;
  generation: number;
}

/**
 * The single owner of addon job scheduling (§7): contribution registration
 * (register/dispose from the job family), REST patch/run, and the boot-time
 * scan all go through this one instance, so cron timers live and die with the
 * contribution lifecycle. Descriptors are kept from registration — the boot
 * contribution re-registration runs before start(), so no registry dependency
 * is needed here.
 */
@Injectable()
export class AddonJobScheduler {
  private readonly logger: Logger;
  private readonly handles = new Map<string, ScheduledHandle>();
  private readonly descriptors = new Map<string, JobDescriptor>();
  private readonly inflight = new Map<string, Promise<void>>();
  private generation = 0;

  constructor(
    private readonly jobs: JobStateRepositoryPort,
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
        void this.runOnce(state.orgId, state.addonId, state.jobId, descriptor);
      }
    }
  }

  stop(): void {
    for (const handle of this.handles.values()) {
      handle.stop();
    }
    this.handles.clear();
  }

  register(owner: OwnerKey, descriptor: JobDescriptor): Disposable {
    const key = this.key(owner.orgId, owner.addonId, descriptor.id);
    const generation = ++this.generation;
    this.descriptors.set(key, descriptor);
    const existing = this.jobs.find(owner.orgId, owner.addonId, descriptor.id);
    const enabled = existing?.enabled ?? descriptor.defaultEnabled ?? true;
    if (
      enabled &&
      descriptor.catchUp === 'once' &&
      existing?.nextRunAt !== null &&
      existing?.nextRunAt !== undefined &&
      existing.nextRunAt < this.clock.now()
    ) {
      void this.fire(owner, descriptor);
    }
    this.jobs.upsert({
      orgId: owner.orgId,
      addonId: owner.addonId,
      jobId: descriptor.id,
      nextRunAt: enabled ? this.nextRunAt(descriptor, this.clock.now()) : null,
      lastRunAt: existing?.lastRunAt ?? null,
      lastStatus: existing?.lastStatus ?? null,
      enabled,
    });
    if (enabled) {
      this.reschedule(owner.orgId, owner.addonId, descriptor.id, descriptor.schedule, generation);
    }
    return {
      dispose: () => {
        const handle = this.handles.get(key);
        if (handle === undefined || handle.generation !== generation) {
          return;
        }
        handle.stop();
        this.handles.delete(key);
        this.descriptors.delete(key);
      },
    };
  }

  fire(owner: OwnerKey, descriptor: JobDescriptor): Promise<void> {
    return this.runOnce(owner.orgId, owner.addonId, descriptor.id, descriptor);
  }

  patch(orgId: string, addonId: string, jobId: string, enabled: boolean): void {
    this.jobs.setEnabled(orgId, addonId, jobId, enabled);
    const key = this.key(orgId, addonId, jobId);
    const handle = this.handles.get(key);
    if (handle !== undefined) {
      handle.stop();
      this.handles.delete(key);
    }
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
    await this.runOnce(orgId, addonId, jobId, descriptor);
    const state = this.jobs.find(orgId, addonId, jobId);
    return state?.lastStatus ?? null;
  }

  private reschedule(
    orgId: string,
    addonId: string,
    jobId: string,
    schedule: JobSchedule,
    generation: number = ++this.generation,
  ): void {
    const key = this.key(orgId, addonId, jobId);
    this.handles.get(key)?.stop();
    if ('cron' in schedule) {
      const cron = new Cron(schedule.cron, { timezone: 'UTC' }, () => {
        void this.runOnce(orgId, addonId, jobId);
      });
      this.handles.set(key, { stop: () => cron.stop(), generation });
      return;
    }
    const timer = setInterval(() => {
      void this.runOnce(orgId, addonId, jobId);
    }, schedule.everySec * 1000);
    this.handles.set(key, { stop: () => clearInterval(timer), generation });
  }

  private runOnce(
    orgId: string,
    addonId: string,
    jobId: string,
    descriptor?: JobDescriptor,
  ): Promise<void> {
    const key = this.key(orgId, addonId, jobId);
    const existing = this.inflight.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const run = this.perform(orgId, addonId, jobId, descriptor).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, run);
    return run;
  }

  private async perform(
    orgId: string,
    addonId: string,
    jobId: string,
    descriptor?: JobDescriptor,
  ): Promise<void> {
    const ranAt = this.clock.now();
    let status: string | null = 'ok';
    try {
      const d = descriptor ?? this.descriptorOf(orgId, addonId, jobId);
      const timeoutMs = Math.min(d?.timeoutSec ?? DEFAULT_TIMEOUT_SEC, MAX_TIMEOUT_SEC) * 1000;
      await this.calls.jobRun(orgId, addonId, { jobId }, { timeoutMs });
    } catch (error) {
      status = error instanceof Error ? error.message : 'error';
      this.logger.warn({ orgId, addonId, jobId, status }, 'addon job failed');
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

  private nextRunAt(descriptor: JobDescriptor, now: number): number | null {
    if ('cron' in descriptor.schedule) {
      const job = new Cron(descriptor.schedule.cron, { timezone: 'UTC', paused: true });
      const next = job.nextRun(new Date(now + 1));
      job.stop();
      return next ? next.getTime() : null;
    }
    return now + descriptor.schedule.everySec * 1000;
  }

  private descriptorOf(orgId: string, addonId: string, jobId: string): JobDescriptor | null {
    return this.descriptors.get(this.key(orgId, addonId, jobId)) ?? null;
  }

  private key(orgId: string, addonId: string, jobId: string): string {
    return `${orgId}/${addonId}/${jobId}`;
  }
}
