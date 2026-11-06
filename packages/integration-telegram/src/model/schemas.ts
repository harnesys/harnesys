import { z } from 'zod';

export const KeywordsStageSchema = z.object({
  type: z.literal('keywords'),
  config: z.object({
    terms: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
    match: z.enum(['any', 'all']).default('any'),
    exclude: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
  }),
});

export const FilterStageSchema = z.discriminatedUnion('type', [KeywordsStageSchema]);
export type FilterStageInput = z.infer<typeof FilterStageSchema>;

export const CreateReaderBodySchema = z.object({
  label: z.string().trim().min(1).max(80),
  apiId: z.number().int().min(1),
  apiHash: z.string().trim().length(32),
  phone: z.string().trim().min(6).max(20),
});
export type CreateReaderBody = z.infer<typeof CreateReaderBodySchema>;

export const AuthorizeReaderBodySchema = z.object({
  readerId: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(32),
  password: z.string().trim().min(1).max(128).optional(),
});
export type AuthorizeReaderBody = z.infer<typeof AuthorizeReaderBodySchema>;

export const ReaderPublicSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  status: z.enum(['anonymous', 'awaiting_code', 'awaiting_password', 'authorized', 'error']),
  apiId: z.number().int(),
  phoneMasked: z.string(),
  dcId: z.number().int().nullable(),
  lastError: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ReaderPublic = z.infer<typeof ReaderPublicSchema>;

export const AddSourceBodySchema = z.object({
  peer: z.string().trim().min(2).max(128),
  invite: z.string().trim().min(1).max(512).optional(),
  watchTopics: z.boolean().optional(),
});
export type AddSourceBody = z.infer<typeof AddSourceBodySchema>;

export const SourcePublicSchema = z.object({
  id: z.string().uuid(),
  readerId: z.string().uuid(),
  peerKind: z.enum(['channel', 'group', 'supergroup']),
  peerId: z.string(),
  username: z.string().nullable(),
  title: z.string(),
  joined: z.boolean(),
  watchTopics: z.boolean(),
  lastPostId: z.number().int(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SourcePublic = z.infer<typeof SourcePublicSchema>;

export const UpsertRuleBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  agentId: z.string().uuid(),
  threadId: z.string().uuid().optional(),
  modeId: z.string().trim().min(1).max(48).optional(),
  detail: z.string().trim().max(2000).optional(),
  sourceIds: z.array(z.string().uuid()).min(1).max(50),
  filter: z.array(FilterStageSchema).max(8).optional(),
  history: z.enum(['none', 'last']).optional(),
  historyLast: z.number().int().min(1).max(100).optional(),
  maxRunsPerDay: z.number().int().min(1).max(500).optional(),
  throttleSec: z.number().int().min(0).max(3600).optional(),
  status: z.enum(['active', 'paused', 'failed']).optional(),
});
export type UpsertRuleBody = z.infer<typeof UpsertRuleBodySchema>;

export const RulePublicSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(['active', 'paused', 'failed']),
  agentId: z.string().uuid(),
  threadId: z.string().uuid(),
  modeId: z.string(),
  detail: z.string(),
  sourceIds: z.array(z.string().uuid()),
  filter: z.array(FilterStageSchema),
  history: z.enum(['none', 'last']),
  historyLast: z.number().int(),
  maxRunsPerDay: z.number().int(),
  throttleSec: z.number().int(),
  runsToday: z.number().int(),
  lastFiredAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RulePublic = z.infer<typeof RulePublicSchema>;

export const PostPublicSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  sourceTitle: z.string(),
  postId: z.number().int(),
  topicId: z.number().int().nullable(),
  authorTitle: z.string().nullable(),
  text: z.string(),
  url: z.string().nullable(),
  mediaKinds: z.array(z.string()),
  publishedAt: z.string(),
  receivedAt: z.string(),
  outcome: z.enum(['new', 'filtered', 'fired', 'throttled', 'over_limit', 'error']),
  fireCount: z.number().int(),
});
export type PostPublic = z.infer<typeof PostPublicSchema>;

export const ListPostsQuerySchema = z.object({
  sourceId: z.string().uuid().optional(),
  outcome: z.enum(['new', 'filtered', 'fired', 'throttled', 'over_limit', 'error']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListPostsQuery = z.infer<typeof ListPostsQuerySchema>;

export const BackfillBodySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type BackfillBody = z.infer<typeof BackfillBodySchema>;
