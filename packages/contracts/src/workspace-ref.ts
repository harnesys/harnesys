import { z } from 'zod';

export const WorkspaceRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inherit') }),
  z.object({ kind: z.literal('thread') }),
  z.object({
    kind: z.literal('source'),
    sourceId: z.string().min(1),
    subpath: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('worktree'),
    sourceId: z.string().min(1),
    worktreeId: z.string().min(1),
    subpath: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('folder'),
    hostId: z.string().min(1).optional(),
    path: z.string().min(1),
  }),
]);
export type WorkspaceRef = z.infer<typeof WorkspaceRefSchema>;

export const RunEnvironmentAnchorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('source'),
    sourceId: z.string().min(1),
    worktreeId: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('folder'),
    hostId: z.string().min(1).optional(),
    path: z.string().min(1),
  }),
]);
export type RunEnvironmentAnchor = z.infer<typeof RunEnvironmentAnchorSchema>;

export const RunEnvironmentProvenanceSchema = z.enum(['run', 'thread', 'agent', 'fallback']);
export type RunEnvironmentProvenance = z.infer<typeof RunEnvironmentProvenanceSchema>;

export const RunEnvironmentIsolationSchema = z.object({
  mode: z.enum(['host', 'container']),
  image: z.string().min(1).optional(),
});
export type RunEnvironmentIsolation = z.infer<typeof RunEnvironmentIsolationSchema>;

export const RunEnvironmentSchema = z.object({
  anchor: RunEnvironmentAnchorSchema.nullable(),
  subpath: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  cwd: z.enum(['thread', 'anchor']),
  provenance: RunEnvironmentProvenanceSchema,
  isolation: RunEnvironmentIsolationSchema.optional(),
});
export type RunEnvironment = z.infer<typeof RunEnvironmentSchema>;
