import { Injectable } from '@harnesys/brix';
import { JobDescriptorSchema } from '@harnesys/sdk';
import type { z } from 'zod';
import { AddonJobScheduler } from '../../../../application/addons/jobs/schedule-jobs.service.ts';
import type { FamilyModule, HandlerSpec } from '../../../../domain/addons/family-module.ts';
import { handlerSpec } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import { AddonCallPort } from '../../../../domain/addons/ports/addon-call.port.ts';

type JobSchema = z.infer<typeof JobDescriptorSchema>;

const HANDLERS: readonly HandlerSpec[] = [handlerSpec('job.run')];
const JOB_CALL_TIMEOUT_MS = 15_000;

/**
 * Job family facade. Scheduling itself is delegated to the single
 * AddonJobScheduler (application layer): registration returns the disposable
 * that stops the cron when the contribution is deactivated.
 */
@Injectable()
export class JobFamilyModule implements FamilyModule<JobSchema> {
  readonly family = 'job';
  readonly versions = [1] as const;
  readonly handlers = HANDLERS;
  readonly permissions: readonly string[] = [];

  constructor(
    private readonly scheduler: AddonJobScheduler,
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
