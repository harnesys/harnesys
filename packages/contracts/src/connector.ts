import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';

export const ConnectorProviderSchema = z.literal('telegram');
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

export const ConnectorPublicSchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  agentId: z.string().uuid(),
  provider: ConnectorProviderSchema,
  status: ConnectorStatusSchema,
  botUsername: z.string(),
  lastError: z.string().nullable(),
  threadId: z.string().uuid(),
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

export const UpsertTelegramConnectorResponseSchema = z.object({
  connector: ConnectorPublicSchema,
  pairCode: z.string().min(1),
  pairUrl: z.string().min(1),
  threadId: z.string().uuid(),
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
