import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';

export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;
export const INVITE_TTL_MIN_DEFAULT = 15;
export const INVITE_TTL_MIN_MAX = 1440;
export const PRESENCE_OFFLINE_AFTER_MS = 90_000;

export const IssueInviteBodySchema = z.object({
  nodeName: z.string().min(1),
  ttlMin: z.number().int().positive().max(INVITE_TTL_MIN_MAX).optional(),
});
export type IssueInviteBody = z.infer<typeof IssueInviteBodySchema>;

export const IssuedInviteSchema = z.object({
  inviteId: z.string().uuid(),
  code: z.string().min(1),
  expiresAt: z.string().min(1),
  relayUrlHint: z.string().min(1).nullable(),
});
export type IssuedInvite = z.infer<typeof IssuedInviteSchema>;

export const ActiveInviteSchema = z.object({
  inviteId: z.string().uuid(),
  nodeName: z.string().min(1),
  expiresAt: z.string().min(1),
  createdAt: z.string().min(1),
});
export type ActiveInvite = z.infer<typeof ActiveInviteSchema>;

export const EnrollBodySchema = z.object({
  code: z.string().min(1),
  nodeName: z.string().min(1),
  nodeId: z.string().uuid().optional(),
});
export type EnrollBody = z.infer<typeof EnrollBodySchema>;

export const EnrollResponseSchema = z.object({
  nodeId: z.string().uuid(),
  token: z.string().min(1),
  ticketKey: z.string().min(1),
  orgId: OrgIdSchema,
  orgName: z.string().min(1),
  description: z.string().max(500).default(''),
});
export type EnrollResponse = z.infer<typeof EnrollResponseSchema>;

export const RotateNodeTokenResponseSchema = z.object({
  nodeId: z.string().uuid(),
  token: z.string().min(1),
  ticketKey: z.string().min(1),
});
export type RotateNodeTokenResponse = z.infer<typeof RotateNodeTokenResponseSchema>;

export const PairBodySchema = z.object({
  relayUrl: z.string().min(1),
  inviteCode: z.string().min(1),
  nodeName: z.string().min(1),
  orgId: OrgIdSchema,
});
export type PairBody = z.infer<typeof PairBodySchema>;

export const PairResponseSchema = z.object({
  ok: z.literal(true),
  nodeId: z.string().uuid(),
  orgId: OrgIdSchema,
  orgName: z.string().min(1),
});
export type PairResponse = z.infer<typeof PairResponseSchema>;

export const OrgNodeIdentitySchema = z.object({
  orgId: OrgIdSchema,
  nodeId: z.string().uuid(),
  nodeName: z.string().min(1),
  role: z.literal('worker'),
  relayUrl: z.string().min(1),
  token: z.string().min(1),
  ticketKey: z.string().min(1),
});
export type OrgNodeIdentity = z.infer<typeof OrgNodeIdentitySchema>;

export const NodeStatusSchema = z.enum(['online', 'offline', 'draining']);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

export const NodeConfigSyncSchema = z.enum([
  'ready',
  'syncing',
  'stale',
  'incompatible',
  'unknown',
]);
export type NodeConfigSync = z.infer<typeof NodeConfigSyncSchema>;

export const FleetNodeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  role: z.enum(['relay', 'worker']),
  status: NodeStatusSchema,
  lastSeenAt: z.string().nullable(),
  enrolledAt: z.string().min(1),
  diskFreeBytes: z.number().nullable().optional(),
  diskTotalBytes: z.number().nullable().optional(),
  activeClaims: z.number().int().nonnegative(),
  acceptsWork: z.boolean(),
  configSync: NodeConfigSyncSchema.optional(),
  acceptedRevision: z.number().int().nonnegative().nullable().optional(),
  targetRevision: z.number().int().nonnegative().nullable().optional(),
  syncReason: z.string().nullable().optional(),
});
export type FleetNode = z.infer<typeof FleetNodeSchema>;

export const FleetNodesResponseSchema = z.object({
  nodes: z.array(FleetNodeSchema),
});
export type FleetNodesResponse = z.infer<typeof FleetNodesResponseSchema>;

export const ConnectInfoSchema = z.object({
  port: z.number().int().positive(),
  publicOrigin: z.string().nullable(),
  lanAddresses: z.array(z.string()),
  relayUrlHint: z.string().min(1),
});
export type ConnectInfo = z.infer<typeof ConnectInfoSchema>;

export const HeartbeatBodySchema = z.object({
  diskFreeBytes: z.number().int().nonnegative().nullable().optional(),
  diskTotalBytes: z.number().int().nonnegative().nullable().optional(),
});
export type HeartbeatBody = z.infer<typeof HeartbeatBodySchema>;

export const HeartbeatResponseSchema = z.object({
  ok: z.literal(true),
  status: NodeStatusSchema,
});
export type HeartbeatResponse = z.infer<typeof HeartbeatResponseSchema>;

export const RetargetBodySchema = z.object({
  orgId: OrgIdSchema,
  relayUrl: z.string().min(1),
});
export type RetargetBody = z.infer<typeof RetargetBodySchema>;

export const PromoteStartBodySchema = z.object({
  targetNodeId: z.string().uuid(),
  newRelayUrl: z.string().min(1),
});
export type PromoteStartBody = z.infer<typeof PromoteStartBodySchema>;

export const PromoteStartResponseSchema = z.object({
  promoteToken: z.string().min(1),
  orgId: OrgIdSchema,
  expiresAt: z.string().min(1),
  newRelayUrl: z.string().min(1),
});
export type PromoteStartResponse = z.infer<typeof PromoteStartResponseSchema>;

export const PromoteAcceptBodySchema = z.object({
  orgId: OrgIdSchema,
  sourceRelayUrl: z.string().min(1),
  promoteToken: z.string().min(1),
});
export type PromoteAcceptBody = z.infer<typeof PromoteAcceptBodySchema>;

export const PromoteAcceptResponseSchema = z.object({
  ok: z.literal(true),
  orgId: OrgIdSchema,
  role: z.literal('relay'),
});
export type PromoteAcceptResponse = z.infer<typeof PromoteAcceptResponseSchema>;

export const PromoteIdentitySliceResponseSchema = z.object({
  users: z.array(
    z.object({
      id: z.string(),
      login: z.string(),
      name: z.string(),
      passwordHash: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
  memberships: z.array(
    z.object({
      userId: z.string(),
      orgId: OrgIdSchema,
      capabilities: z.array(z.string()),
      updatedAt: z.string(),
    }),
  ),
});
export type PromoteIdentitySliceResponse = z.infer<typeof PromoteIdentitySliceResponseSchema>;

export const PromoteCompleteBodySchema = z.object({
  promoteToken: z.string().min(1),
  ticketKey: z.string().min(1),
});
export type PromoteCompleteBody = z.infer<typeof PromoteCompleteBodySchema>;

export const PromoteCompleteResponseSchema = z.object({
  ok: z.literal(true),
  orgId: OrgIdSchema,
  role: z.literal('worker'),
  relayUrl: z.string().min(1),
});
export type PromoteCompleteResponse = z.infer<typeof PromoteCompleteResponseSchema>;

export const ProxyRequestSchema = z.object({
  method: z.string().min(1),
  path: z.string().min(1),
  body: z.string().nullable().optional(),
  contentType: z.string().nullable().optional(),
});
export type ProxyRequest = z.infer<typeof ProxyRequestSchema>;
