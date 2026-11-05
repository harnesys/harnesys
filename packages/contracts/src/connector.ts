import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';
import { ThreadKindSchema, ThreadMemberSchema } from './thread.ts';

export const ConnectorProviderSchema = z.string().min(1);
export type ConnectorProvider = z.infer<typeof ConnectorProviderSchema>;

export const ConnectorStatusSchema = z.enum(['awaiting_pair', 'active', 'paused', 'error']);
export type ConnectorStatus = z.infer<typeof ConnectorStatusSchema>;

export const MirrorPolicyPublicSchema = z.object({
  text: z.boolean(),
  ask: z.boolean(),
  failures: z.boolean(),
  files: z.boolean(),
  appUserEcho: z.boolean(),
});
export type MirrorPolicyPublic = z.infer<typeof MirrorPolicyPublicSchema>;

export const ConnectorCapabilitiesSchema = z.object({
  canReadUnmentioned: z.boolean(),
  supportsTopics: z.boolean(),
  supportsReplyTargets: z.boolean(),
  canEditMessages: z.boolean(),
  maxMessageLength: z.number().int().positive(),
  streaming: z.boolean(),
});
export type ConnectorCapabilities = z.infer<typeof ConnectorCapabilitiesSchema>;

export const ConnectorBindingStatusSchema = z.enum(['active', 'unpaired']);
export type ConnectorBindingStatus = z.infer<typeof ConnectorBindingStatusSchema>;

export const ConnectorBindingPublicSchema = z.object({
  id: z.string().uuid(),
  chatId: z.string(),
  topicId: z.string().nullable(),
  chatType: z.string().min(1),
  title: z.string().nullable(),
  status: ConnectorBindingStatusSchema,
  threadId: z.string().uuid().nullable(),
  threadTitle: z.string().nullable(),
  threadKind: ThreadKindSchema.nullable(),
  agentIds: z.array(z.string().uuid()),
  autoReplyAgentId: z.string().uuid().nullable(),
});
export type ConnectorBindingPublic = z.infer<typeof ConnectorBindingPublicSchema>;

export const ConnectorPublicSchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  provider: ConnectorProviderSchema,
  status: ConnectorStatusSchema,
  botId: z.string(),
  botUsername: z.string(),
  lastError: z.string().nullable(),
  pairExpiresAt: z.string().nullable(),
  capabilities: ConnectorCapabilitiesSchema,
  capabilityWarning: z.string().nullable(),
  bindings: z.array(ConnectorBindingPublicSchema),
  policy: MirrorPolicyPublicSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type ConnectorPublic = z.infer<typeof ConnectorPublicSchema>;

export const UpsertTelegramConnectorBodySchema = z.object({
  token: z.string().trim().min(1),
});
export type UpsertTelegramConnectorBody = z.infer<typeof UpsertTelegramConnectorBodySchema>;

export const PatchTelegramPolicyBodySchema = z
  .object({
    text: z.boolean(),
    ask: z.boolean(),
    failures: z.boolean(),
    files: z.boolean(),
    appUserEcho: z.boolean(),
  })
  .strict();
export type PatchTelegramPolicyBody = z.infer<typeof PatchTelegramPolicyBodySchema>;

export const ListConnectorsQuerySchema = z.object({
  provider: z.string().trim().min(1).optional(),
  agentId: z.string().uuid().optional(),
});
export type ListConnectorsQuery = z.infer<typeof ListConnectorsQuerySchema>;

export const AttachChatBodySchema = z.object({
  chatId: z.string().trim().min(1),
  topicId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(160).optional(),
});
export type AttachChatBody = z.infer<typeof AttachChatBodySchema>;

export const ConnectChatBodySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('existing'),
    threadId: z.string().uuid(),
    allowPromote: z.boolean().optional(),
  }),
  z.object({
    mode: z.literal('new'),
    title: z.string().trim().min(1).max(120).optional(),
    agentIds: z.array(z.string().uuid()).min(1).max(8),
    autoReplyAgentId: z.string().uuid().nullable().optional(),
  }),
]);
export type ConnectChatBody = z.infer<typeof ConnectChatBodySchema>;

export const CreateTopicBodySchema = z.object({
  name: z.string().trim().min(1).max(128),
});
export type CreateTopicBody = z.infer<typeof CreateTopicBodySchema>;

export const RenameChatBodySchema = z.object({
  title: z.string().trim().min(1).max(160),
});
export type RenameChatBody = z.infer<typeof RenameChatBodySchema>;

export const RefreshChatIssueSchema = z.object({
  bindingId: z.string().uuid(),
  message: z.string().min(1),
});
export type RefreshChatIssue = z.infer<typeof RefreshChatIssueSchema>;

export const RefreshChatsResponseSchema = z.object({
  connector: ConnectorPublicSchema,
  issues: z.array(RefreshChatIssueSchema),
});
export type RefreshChatsResponse = z.infer<typeof RefreshChatsResponseSchema>;

export const UpsertTelegramConnectorResponseSchema = z.object({
  connector: ConnectorPublicSchema,
  pairCode: z.string().min(1),
  pairUrl: z.string().min(1),
});
export type UpsertTelegramConnectorResponse = z.infer<typeof UpsertTelegramConnectorResponseSchema>;

export const ListConnectorsResponseSchema = z.object({
  items: z.array(ConnectorPublicSchema),
});
export type ListConnectorsResponse = z.infer<typeof ListConnectorsResponseSchema>;

export const IssuePairCodeResponseSchema = z.object({
  pairCode: z.string().min(1),
  pairUrl: z.string().min(1),
});
export type IssuePairCodeResponse = z.infer<typeof IssuePairCodeResponseSchema>;

export const TelegramConnectorActionResponseSchema = z.object({
  connector: ConnectorPublicSchema,
});
export type TelegramConnectorActionResponse = z.infer<typeof TelegramConnectorActionResponseSchema>;

export const UnpairTelegramConnectorResponseSchema = z.object({
  connector: ConnectorPublicSchema,
  pairCode: z.string().min(1),
  pairUrl: z.string().min(1),
});
export type UnpairTelegramConnectorResponse = z.infer<typeof UnpairTelegramConnectorResponseSchema>;

export const ConnectChatResponseSchema = z.object({
  connector: ConnectorPublicSchema,
  binding: ConnectorBindingPublicSchema,
});
export type ConnectChatResponse = z.infer<typeof ConnectChatResponseSchema>;

export const AttachChatResponseSchema = ConnectChatResponseSchema;
export type AttachChatResponse = z.infer<typeof AttachChatResponseSchema>;

export const CreateTopicResponseSchema = ConnectChatResponseSchema;
export type CreateTopicResponse = z.infer<typeof CreateTopicResponseSchema>;

export const ThreadMemberListSchema = z.array(ThreadMemberSchema);
