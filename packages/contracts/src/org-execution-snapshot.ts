import { z } from 'zod';
import { AgentPublicSchema } from './agent.ts';
import { FileRulePublicSchema } from './file-access.ts';
import { OrgIdSchema } from './org-machine.ts';
import { OrgSettingsSchema } from './org-settings.ts';
import { SourceSchema } from './source.ts';

export const ORG_EXECUTION_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export const AgentSnapshotSchema = AgentPublicSchema;
export type AgentSnapshot = z.infer<typeof AgentSnapshotSchema>;

export const SourceSnapshotSchema = SourceSchema;
export type SourceSnapshot = z.infer<typeof SourceSnapshotSchema>;

export const ProviderSnapshotSchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  name: z.string().min(1),
  driver: z.string().min(1),
  apiUrl: z.string().nullable(),

  apiKeyRef: z.string().min(1).nullable(),
  headers: z.record(z.string(), z.string()),
  enabled: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type ProviderSnapshot = z.infer<typeof ProviderSnapshotSchema>;

export const ModelSnapshotSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().uuid(),
  name: z.string().min(1),
  kind: z.string().min(1),
  metadata: z.unknown(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type ModelSnapshot = z.infer<typeof ModelSnapshotSchema>;

export const RuntimeSnapshotSchema = z.object({
  skillsSourceAutoLoad: OrgSettingsSchema.shape.skillsSourceAutoLoad,
  timezone: OrgSettingsSchema.shape.timezone,
  browser: OrgSettingsSchema.shape.browser,
});
export type RuntimeSnapshot = z.infer<typeof RuntimeSnapshotSchema>;

export const OrgExecutionSnapshotSchema = z.object({
  schemaVersion: z.literal(ORG_EXECUTION_SNAPSHOT_SCHEMA_VERSION),
  revision: z.number().int().nonnegative(),
  agents: z.array(AgentSnapshotSchema),
  sources: z.array(SourceSchema),
  providers: z.array(ProviderSnapshotSchema),
  models: z.array(ModelSnapshotSchema),
  fileAccessRules: z.array(FileRulePublicSchema).default([]),
  runtime: RuntimeSnapshotSchema,
});
export type OrgExecutionSnapshot = z.infer<typeof OrgExecutionSnapshotSchema>;

export const SnapshotAckStatusSchema = z.enum(['accepted', 'incompatible']);
export type SnapshotAckStatus = z.infer<typeof SnapshotAckStatusSchema>;

export const SnapshotAckFrameSchema = z.object({
  kind: z.literal('SNAPSHOT_ACK'),
  revision: z.number().int().nonnegative(),
  status: SnapshotAckStatusSchema,
  reason: z.string().min(1).optional(),
});
export type SnapshotAckFrame = z.infer<typeof SnapshotAckFrameSchema>;

export const ConnectedFrameSchema = z.object({
  kind: z.literal('CONNECTED'),
  nodeId: z.string().uuid(),
  snapshot: OrgExecutionSnapshotSchema,
});
export type ConnectedFrame = z.infer<typeof ConnectedFrameSchema>;

export const SnapshotFrameSchema = z.object({
  kind: z.literal('SNAPSHOT'),
  snapshot: OrgExecutionSnapshotSchema,
});
export type SnapshotFrame = z.infer<typeof SnapshotFrameSchema>;

export const RunEventAckFrameSchema = z.object({
  kind: z.literal('RUN_EVENT_ACK'),
  runId: z.string().uuid(),
  accepted: z.number().int().nonnegative(),
  lastSeq: z.number().int().nonnegative(),
});
export type RunEventAckFrame = z.infer<typeof RunEventAckFrameSchema>;
