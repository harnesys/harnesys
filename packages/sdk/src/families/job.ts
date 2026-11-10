import { z } from 'zod';
import type { L10n } from '../manifest/l10n.ts';
import { L10nSchema } from '../manifest/l10n.ts';

export const JOB_SCHEMA_VERSION = 1;

export interface JobDescriptor {
  id: string;
  title: L10n;
  schedule: { cron: string } | { everySec: number };
  timezone?: 'org' | 'utc';
  timeoutSec?: number;
  catchUp: 'none' | 'once';
  defaultEnabled?: boolean;
}

export const JobScheduleSchema = z.union([
  z.object({ cron: z.string().min(1) }),
  z.object({ everySec: z.number().int().positive() }),
]);

export const JobDescriptorSchema = z.object({
  id: z.string().min(1),
  title: L10nSchema,
  schedule: JobScheduleSchema,
  timezone: z.enum(['org', 'utc']).optional(),
  timeoutSec: z.number().int().positive().optional(),
  catchUp: z.enum(['none', 'once']),
  defaultEnabled: z.boolean().optional(),
});

export const jobFamily = {
  family: 'job',
  versions: [JOB_SCHEMA_VERSION],
  schema: (v: number): z.ZodType => {
    if (v !== JOB_SCHEMA_VERSION) {
      throw new Error(`job descriptor schema version ${v} is not supported`);
    }
    return JobDescriptorSchema;
  },
};
