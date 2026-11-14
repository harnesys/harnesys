import { z } from 'zod';
import type { L10n } from '../manifest/l10n.ts';
import { L10nSchema } from '../manifest/l10n.ts';

export const WORKER_SCHEMA_VERSION = 1;

export interface WorkerDescriptor {
  id: string;
  title: L10n;
  autostart: boolean;
  restart: 'on-failure' | 'never';
}

export const WorkerDescriptorSchema = z.object({
  id: z.string().min(1),
  title: L10nSchema,
  autostart: z.boolean(),
  restart: z.enum(['on-failure', 'never']),
});

export const workerFamily = {
  family: 'worker',
  versions: [WORKER_SCHEMA_VERSION],
  schema: (v: number): z.ZodType => {
    if (v !== WORKER_SCHEMA_VERSION) {
      throw new Error(`worker descriptor schema version ${v} is not supported`);
    }
    return WorkerDescriptorSchema;
  },
};
