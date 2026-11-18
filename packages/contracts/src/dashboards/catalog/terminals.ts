import { z } from 'zod';
import { defineCatalogEntry } from './define.ts';

/** `TerminalSessionRecord` from `@harnesys/studio-shared`, mirrored as a schema. */
export const TerminalSessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  cwd: z.string(),
  createdAt: z.string(),
  exitCode: z.number().nullable(),
  exited: z.boolean(),
  origin: z.enum(['user', 'agent']),
  orgId: z.string().optional(),
  name: z.string().optional(),
  target: z.string().optional(),
});
export type TerminalSession = z.infer<typeof TerminalSessionSchema>;

export const terminalsCatalogEntry = defineCatalogEntry({
  id: 'terminals',
  label: 'Terminals',
  description: 'Terminal sessions of this org across sources and hosts.',
  method: 'GET',
  path: '/orgs/:orgId/terminals',
  response: z.array(TerminalSessionSchema),
  invalidatedBy: ['terminal'],
});
