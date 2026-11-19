import { z } from 'zod';
import type { L10n } from '../manifest/l10n.ts';
import { L10nSchema } from '../manifest/l10n.ts';

export const SOURCE_KIND_SCHEMA_VERSION = 1;

export interface SourceKindDescriptor {
  id: string;
  title: L10n;
  connection?: string;
  /**
   * What a source attached from this kind is. `cloud` (default) mirrors files
   * through the add-on backend (`source.download`/`upload`). `git` attaches a
   * core git source: entries must carry `url` (an HTTPS clone URL) and the
   * add-on only needs `source.list`/`source.stat`.
   */
  mount?: 'cloud' | 'git';
  supportsRootMount?: boolean;
  supportsSearch?: boolean;
  rootTitle?: string;
}

export const SourceKindDescriptorSchema = z.object({
  id: z.string().min(1),
  title: L10nSchema,
  connection: z.string().min(1).optional(),
  mount: z.enum(['cloud', 'git']).optional(),
  supportsRootMount: z.boolean().optional(),
  supportsSearch: z.boolean().optional(),
  rootTitle: z.string().min(1).optional(),
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
