import { z } from 'zod';
import type { L10n } from '../manifest/l10n.ts';
import { L10nSchema } from '../manifest/l10n.ts';

export const VIEWER_SCHEMA_VERSION = 1;

export interface ViewerDescriptor {
  id: string;
  title: L10n;
  /** Dot-prefixed file extensions this viewer handles, lowercase, e.g. ['.drawio']. */
  extensions: string[];
  /** Add-on route (GET) that serves the editor/preview HTML document. */
  route: string;
  mode: 'view' | 'edit';
  /** Host offers "New <title> file" in the sources tree when true. */
  create?: boolean;
}

export const ViewerExtensionSchema = z
  .string()
  .regex(/^\.[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'extension must be a dot-prefixed file extension');

export const ViewerDescriptorSchema = z.object({
  id: z.string().min(1),
  title: L10nSchema,
  extensions: z.array(ViewerExtensionSchema).min(1),
  route: z
    .string()
    .regex(/^\/[A-Za-z0-9/_:.-]*$/, 'route must start with / and use :param segments'),
  mode: z.enum(['view', 'edit']),
  create: z.boolean().optional(),
});

export const viewerFamily = {
  family: 'viewer',
  versions: [VIEWER_SCHEMA_VERSION],
  schema: (v: number): z.ZodType => {
    if (v !== VIEWER_SCHEMA_VERSION) {
      throw new Error(`viewer descriptor schema version ${v} is not supported`);
    }
    return ViewerDescriptorSchema;
  },
} as const;
