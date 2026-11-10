import { Injectable, Logger } from '@harnesys/brix';
import { JobDescriptorSchema } from '@harnesys/sdk';
import { Cron } from 'croner';
import type { z } from 'zod';
import type { FamilyModule, HandlerSpec } from '../../../../domain/addons/family-module.ts';
import { handlerSpec } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import { ownerKeyId } from '../../../../domain/addons/owner.ts';
import { AddonCallPort } from '../../../../domain/addons/ports/addon-call.port.ts';
import { InstanceSupervisorPort } from '../../../../domain/addons/ports/instance-supervisor.port.ts';
import { JobStateRepositoryPort } from '../../../../domain/addons/ports/job-state-repository.port.ts';

type JobSchema = z.infer<typeof JobDescriptorSchema>;

const HANDLERS: readonly HandlerSpec[] = [handlerSpec('job.run')];
const DEFAULT_JOB_TIMEOUT_MS = 60_000;
const MAX_JOB_TIMEOUT_MS = 3_600_000;
const JOB_CALL_TIMEOUT_MS = 15_000;

export function jobCronPattern(d: JobSchema): string {
  if ('cron' in d.schedule) {
    return d.schedule.cron;
  }
  return `*/${d.schedule.everySec} * * * * *`;
}

function jobTimeoutMs(d: JobSchema): number {
  return Math.min(d.timeoutSec ? d.timeoutSec * 1000 : DEFAULT_JOB_TIMEOUT_MS, MAX_JOB_TIMEOUT_MS);
}

interface ScheduledJob {
  owner: OwnerKey;
  descriptor: JobSchema;
  cron: Cron;
}

@Injectable()
export class AddonJobScheduler {
  private readonly scheduled = new Map<string, ScheduledJob>();
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly state: JobStateRepositoryPort,
    private readonly supervisor: InstanceSupervisorPort,
    private readonly calls: AddonCallPort,
    private readonly logger: Logger,
  ) {}

  register(owner: OwnerKey, d: JobSchema): Disposable {
    const key = `${ownerKeyId(owner)}/${d.id}`;
    const existing = this.state.find(owner.orgId, owner.addonId, d.id);
    const enabled = existing?.enabled ?? d.defaultEnabled ?? true;
    this.state.upsert({
      orgId: owner.orgId,
      addonId: owner.addonId,
      jobId: d.id,
      nextRunAt: null,
      lastRunAt: existing?.lastRunAt ?? null,
      lastStatus: existing?.lastStatus ?? null,
      enabled,
    });
    if (enabled) {
      if (
        d.catchUp === 'once' &&
        existing?.nextRunAt !== null &&
        existing?.nextRunAt !== undefined &&
        existing.nextRunAt < Date.now()
      ) {
        void this.fire(owner, d);
      }
      const cron = new Cron(jobCronPattern(d), { timezone: 'Etc/UTC' }, () => {
        void this.fire(owner, d);
      });
      this.state.upsert({
        orgId: owner.orgId,
        addonId: owner.addonId,
        jobId: d.id,
        nextRunAt: cron.nextRun()?.getTime() ?? null,
        lastRunAt: existing?.lastRunAt ?? null,
        lastStatus: existing?.lastStatus ?? null,
        enabled,
      });
      this.scheduled.set(key, { owner, descriptor: d, cron });
    }
    return {
      dispose: () => {
        this.scheduled.get(key)?.cron.stop();
        this.scheduled.delete(key);
        this.inFlight.delete(key);
      },
    };
  }

  runNow(orgId: string, addonId: string, jobId: string): Promise<void> {
    const key = [...this.scheduled.entries()].find(
      ([, job]) =>
        job.owner.orgId === orgId && job.owner.addonId === addonId && job.descriptor.id === jobId,
    )?.[0];
    if (key === undefined) {
      return Promise.resolve();
    }
    const job = this.scheduled.get(key);
    if (job === undefined) {
      return Promise.resolve();
    }
    return this.fire(job.owner, job.descriptor);
  }

  setEnabled(orgId: string, addonId: string, jobId: string, enabled: boolean): void {
    this.state.setEnabled(orgId, addonId, jobId, enabled);
    for (const [key, job] of this.scheduled.entries()) {
      if (
        job.owner.orgId !== orgId ||
        job.owner.addonId !== addonId ||
        job.descriptor.id !== jobId
      ) {
        continue;
      }
      job.cron.stop();
      this.scheduled.delete(key);
      if (enabled) {
        this.register(job.owner, job.descriptor);
      }
    }
  }

  fire(owner: OwnerKey, d: JobSchema): Promise<void> {
    const key = `${ownerKeyId(owner)}/${d.id}`;
    const existing = this.inFlight.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const run = this.runOnce(owner, d).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, run);
    return run;
  }

  private async runOnce(owner: OwnerKey, d: JobSchema): Promise<void> {
    const row = this.state.find(owner.orgId, owner.addonId, d.id);
    if (row === null || !row.enabled) {
      return;
    }
    try {
      await this.supervisor.ensureRunning(owner.orgId, owner.addonId, `job:${d.id}`);
      await this.calls.jobRun(
        owner.orgId,
        owner.addonId,
        { jobId: d.id },
        { timeoutMs: jobTimeoutMs(d) },
      );
      this.record(owner, d, 'ok');
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'internal';
      this.record(owner, d, reason);
      this.logger.warn({ err: error, addonId: owner.addonId, jobId: d.id }, 'addon job failed');
    }
  }

  private record(owner: OwnerKey, d: JobSchema, status: string): void {
    const scheduled = this.scheduled.get(`${ownerKeyId(owner)}/${d.id}`);
    const row = this.state.find(owner.orgId, owner.addonId, d.id);
    const now = Date.now();
    this.state.recordRun(owner.orgId, owner.addonId, d.id, now, status);
    const nextRunAt = scheduled?.cron.nextRun()?.getTime() ?? null;
    this.state.upsert({
      orgId: owner.orgId,
      addonId: owner.addonId,
      jobId: d.id,
      nextRunAt,
      lastRunAt: now,
      lastStatus: status,
      enabled: row?.enabled ?? true,
    });
  }
}

@Injectable()
export class JobFamilyModule implements FamilyModule<JobSchema> {
  readonly family = 'job';
  readonly versions = [1] as const;
  readonly handlers = HANDLERS;
  readonly permissions: readonly string[] = [];

  constructor(
    readonly scheduler: AddonJobScheduler,
    private readonly calls: AddonCallPort,
  ) {}

  schema(_v: number): z.ZodType<JobSchema> {
    return JobDescriptorSchema as z.ZodType<JobSchema>;
  }

  register(owner: OwnerKey, d: JobSchema): Disposable {
    return this.scheduler.register(owner, d);
  }

  runJobNow(
    orgId: string,
    addonId: string,
    jobId: string,
    opts?: { timeoutMs?: number },
  ): Promise<void> {
    return this.calls.jobRun(orgId, addonId, { jobId }, opts ?? { timeoutMs: JOB_CALL_TIMEOUT_MS });
  }
}
