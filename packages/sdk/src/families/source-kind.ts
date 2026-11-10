import { z } from 'zod';
import type { L10n } from '../manifest/l10n.ts';
import { L10nSchema } from '../manifest/l10n.ts';

export const SOURCE_KIND_SCHEMA_VERSION = 1;

export interface SourceKindDescriptor {
  id: string;
  title: L10n;
  connection?: string;
}

export const SourceKindDescriptorSchema = z.object({
  id: z.string().min(1),
  title: L10nSchema,
  connection: z.string().min(1).optional(),
});

export const sourceKindFamily = {
  family: 'source-kind',
  versions: [SOURCE_KIND_SCHEMA_VERSION],
  schema: (v: number): z.ZodType => {
    if (v !== SOURCE_KIND_SCHEMA_VERSION) {
      throw new Error(`source-kind descriptor schema version ${v} is not supported`);
    }
    return SourceKindDescriptorSchema;
  },
};
