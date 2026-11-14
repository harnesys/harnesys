import { z } from 'zod';
import type { L10n } from '../manifest/l10n.ts';
import { L10nSchema } from '../manifest/l10n.ts';

export const LSP_SCHEMA_VERSION = 1;

export interface LspDescriptor {
  id: string;
  title: L10n;
  connection?: string;
}

export const LspDescriptorSchema = z.object({
  id: z.string().min(1),
  title: L10nSchema,
  connection: z.string().min(1).optional(),
});

export const lspFamily = {
  family: 'lsp',
  versions: [LSP_SCHEMA_VERSION],
  schema: (v: number): z.ZodType => {
    if (v !== LSP_SCHEMA_VERSION) {
      throw new Error(`lsp descriptor schema version ${v} is not supported`);
    }
    return LspDescriptorSchema;
  },
};
