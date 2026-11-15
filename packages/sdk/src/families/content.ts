import { z } from 'zod';
import type { L10n } from '../manifest/l10n.ts';
import { L10nSchema } from '../manifest/l10n.ts';

export const CONTENT_SCHEMA_VERSION = 1;

export interface ContentDescriptor {
  id: string;
  title: L10n;
  kind: 'skill' | 'prompt';
  /**
   * Path from the package root. For `kind: 'skill'` it is the skill directory
   * (containing `SKILL.md` and its `references/`); a path to a single markdown
   * file is still accepted for backward compatibility.
   */
  path: string;
}

export const ContentDescriptorSchema = z.object({
  id: z.string().min(1),
  title: L10nSchema,
  kind: z.enum(['skill', 'prompt']),
  path: z.string().min(1),
});

export const contentFamily = {
  family: 'content',
  versions: [CONTENT_SCHEMA_VERSION],
  schema: (v: number): z.ZodType => {
    if (v !== CONTENT_SCHEMA_VERSION) {
      throw new Error(`content descriptor schema version ${v} is not supported`);
    }
    return ContentDescriptorSchema;
  },
};
