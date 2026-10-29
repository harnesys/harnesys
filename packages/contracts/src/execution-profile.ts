import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';

export const LOCAL_EXECUTION_PROFILE_ID = 'local';

export const ExecutionProfileIdSchema = z.string().uuid().or(z.literal(LOCAL_EXECUTION_PROFILE_ID));
export type ExecutionProfileId = z.infer<typeof ExecutionProfileIdSchema>;

export const ProfileSelectedBySchema = z.enum(['thread', 'issue-rule', 'agent', 'organization']);
export type ProfileSelectedBy = z.infer<typeof ProfileSelectedBySchema>;

export const ExecutionProfileIsolationSchema = z.enum(['host', 'container']);
export type ExecutionProfileIsolation = z.infer<typeof ExecutionProfileIsolationSchema>;

export const EffectiveProfileSchema = z.object({
  profileId: ExecutionProfileIdSchema,
  selectedBy: ProfileSelectedBySchema,
});
export type EffectiveProfile = z.infer<typeof EffectiveProfileSchema>;

export const ExecutionProfileSchema = z.object({
  id: z.string().uuid().or(z.literal(LOCAL_EXECUTION_PROFILE_ID)),
  orgId: OrgIdSchema,
  name: z.string().min(1),
  system: z.boolean(),
  nodeIds: z.array(z.string().uuid()),
  isolation: ExecutionProfileIsolationSchema.default('host'),
  dockerImage: z.string().min(1).nullable().default(null),
});
export type ExecutionProfile = z.infer<typeof ExecutionProfileSchema>;

export const ExecutionProfileListItemSchema = ExecutionProfileSchema.extend({
  isDefault: z.boolean(),
});
export type ExecutionProfileListItem = z.infer<typeof ExecutionProfileListItemSchema>;

export const ExecutionProfilesResponseSchema = z.object({
  items: z.array(ExecutionProfileListItemSchema),
  defaultProfileId: z.string().uuid().or(z.literal(LOCAL_EXECUTION_PROFILE_ID)).nullable(),
});
export type ExecutionProfilesResponse = z.infer<typeof ExecutionProfilesResponseSchema>;

export const CreateExecutionProfileBodySchema = z.object({
  name: z.string().trim().min(1),
});
export type CreateExecutionProfileBody = z.infer<typeof CreateExecutionProfileBodySchema>;

export const UpdateExecutionProfileBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    isolation: ExecutionProfileIsolationSchema.optional(),
    dockerImage: z.string().min(1).nullable().optional(),
  })
  .refine((body) => body.isolation !== 'container' || (body.dockerImage ?? null) !== null, {
    message: 'dockerImage is required when isolation is container',
  });
export type UpdateExecutionProfileBody = z.infer<typeof UpdateExecutionProfileBodySchema>;

export const SetExecutionProfileNodesBodySchema = z.object({
  nodeIds: z.array(z.string().uuid()).refine((items) => new Set(items).size === items.length, {
    message: 'nodeIds must not contain duplicates',
  }),
});
export type SetExecutionProfileNodesBody = z.infer<typeof SetExecutionProfileNodesBodySchema>;

export const SetDefaultExecutionProfileBodySchema = z.object({
  profileId: z.string().uuid().or(z.literal(LOCAL_EXECUTION_PROFILE_ID)),
});
export type SetDefaultExecutionProfileBody = z.infer<typeof SetDefaultExecutionProfileBodySchema>;

export const ExecutionProfileNodeItemSchema = z.object({
  nodeId: z.string().uuid(),
  nodeName: z.string().min(1),
  status: z.enum(['online', 'offline', 'draining']),
  role: z.enum(['relay', 'worker']),
});
export type ExecutionProfileNodeItem = z.infer<typeof ExecutionProfileNodeItemSchema>;

export const ExecutionProfileDetailSchema = ExecutionProfileListItemSchema.extend({
  nodes: z.array(ExecutionProfileNodeItemSchema),
});
export type ExecutionProfileDetail = z.infer<typeof ExecutionProfileDetailSchema>;

export const PlacementQueueCandidateSchema = z.object({
  nodeId: z.string().min(1),
  eligible: z.boolean(),
  reasons: z.array(z.string()),
  activeClaims: z.number().int().nonnegative(),
});
export type PlacementQueueCandidate = z.infer<typeof PlacementQueueCandidateSchema>;

export const PlacementQueueItemSchema = z.object({
  runId: z.string().uuid(),
  threadId: z.string().uuid(),
  profileId: z.string().min(1),
  createdAt: z.string().min(1),
  ageMs: z.number().int().nonnegative(),
  priority: z.number().int().min(1).max(4),
  effectivePriority: z.number().int().min(1).max(4),
  triggerKind: z.enum(['chat', 'issue', 'schedule', 'webhook', 'connector']),
  triggerId: z.string().min(1),
  lastReason: z.string().min(1),
  attempt: z.number().int().nonnegative(),
  expiresAt: z.string().nullable(),
  candidates: z.array(PlacementQueueCandidateSchema),
});
export type PlacementQueueItem = z.infer<typeof PlacementQueueItemSchema>;

export const PlacementQueueResponseSchema = z.object({
  items: z.array(PlacementQueueItemSchema),
});
export type PlacementQueueResponse = z.infer<typeof PlacementQueueResponseSchema>;
