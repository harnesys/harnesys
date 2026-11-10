import { z } from 'zod';

export const FieldTypeSchema = z.enum([
  'text',
  'secret',
  'textarea',
  'url',
  'select',
  'number',
  'boolean',
]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export const FieldValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export type FieldValue = z.infer<typeof FieldValueSchema>;

export const FieldSpecSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: FieldTypeSchema,
  required: z.boolean(),
  placeholder: z.string().optional(),
  help: z.string().optional(),
  default: FieldValueSchema.optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  pattern: z.object({ regex: z.string(), hint: z.string() }).optional(),
  editable: z.boolean().optional(),
  generated: z.boolean().optional(),
});
export type FieldSpec = z.infer<typeof FieldSpecSchema>;

export const ProviderDescriptorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  iconSvg: z.string().nullable(),
  docsUrl: z.string().nullable(),
});
export type ProviderDescriptor = z.infer<typeof ProviderDescriptorSchema>;

export const AppCapabilitiesSchema = z.object({
  setup: z.boolean(),
  verify: z.boolean(),
  webhook: z.boolean(),
});

export const AccountCapabilitiesSchema = z.object({
  revoke: z.boolean(),
  webhook: z.boolean(),
});

export const DescriptorEndpointSchema = z.enum(['redirectUri', 'webhookUrl']);
export const AccountEndpointSchema = z.enum(['webhookUrl']);

export const ScopeOptionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
});
export type ScopeOption = z.infer<typeof ScopeOptionSchema>;

export const AppKindDescriptorSchema = z.object({
  kind: z.string().min(1),
  provider: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  fields: z.array(FieldSpecSchema),
  help: z.object({ steps: z.array(z.string()), consoleUrl: z.string().nullable() }),
  endpoints: z.array(DescriptorEndpointSchema),
  capabilities: AppCapabilitiesSchema,
});
export type AppKindDescriptor = z.infer<typeof AppKindDescriptorSchema>;

export const AccountKindDescriptorSchema = z.object({
  kind: z.string().min(1),
  provider: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  requiresApp: z.array(z.string()),
  inputs: z.array(FieldSpecSchema),
  scopes: z.object({ options: z.array(ScopeOptionSchema), defaults: z.array(z.string()) }),
  access: z.object({ source: z.enum(['stored', 'derived']), keys: z.array(z.string()) }),
  endpoints: z.array(AccountEndpointSchema),
  capabilities: AccountCapabilitiesSchema,
});
export type AccountKindDescriptor = z.infer<typeof AccountKindDescriptorSchema>;

export const ProviderCatalogEntrySchema = ProviderDescriptorSchema.extend({
  appKinds: z.array(AppKindDescriptorSchema),
  accountKinds: z.array(AccountKindDescriptorSchema),
});
export type ProviderCatalogEntry = z.infer<typeof ProviderCatalogEntrySchema>;

export const CatalogResponseSchema = z.object({
  providers: z.array(ProviderCatalogEntrySchema),
});
export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;

export const AccountErrorCodeSchema = z.enum([
  'invalid_credentials',
  'expired',
  'revoked',
  'insufficient_scopes',
  'not_found',
  'rate_limited',
  'denied',
  'identity_mismatch',
  'invalid_signature',
  'invalid_input',
  'session_expired',
  'provider_unavailable',
  'invalid_response',
  'unknown',
]);
export type AccountErrorCode = z.infer<typeof AccountErrorCodeSchema>;

export const FieldErrorCodeSchema = z.enum(['required', 'pattern', 'type', 'option', 'unknown']);
export type FieldErrorCode = z.infer<typeof FieldErrorCodeSchema>;

export const AppStatusSchema = z.enum(['configured', 'invalid']);
export const AccountStatusSchema = z.enum(['connected', 'expired', 'error']);
export type AppStatus = z.infer<typeof AppStatusSchema>;
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const AppEndpointsSchema = z.object({
  redirectUri: z.string().optional(),
  webhookUrl: z.string().optional(),
});

export const AccountEndpointsSchema = z.object({
  webhookUrl: z.string().optional(),
});

export const AppViewSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  label: z.string().min(1),
  status: AppStatusSchema,
  lastError: AccountErrorCodeSchema.nullable(),
  values: z.record(z.string(), FieldValueSchema),
  secretFields: z.array(z.string()),
  endpoints: AppEndpointsSchema,
  verifiedAt: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AppView = z.infer<typeof AppViewSchema>;

export const AccountViewSchema = z.object({
  id: z.string().min(1),
  appId: z.string().nullable(),
  kind: z.string().min(1),
  externalAccountId: z.string(),
  partition: z.string(),
  label: z.string(),
  status: AccountStatusSchema,
  lastError: AccountErrorCodeSchema.nullable(),
  scopes: z.array(z.string()),
  expiresAt: z.number().nullable(),
  config: z.record(z.string(), FieldValueSchema),
  secretFields: z.array(z.string()),
  endpoints: AccountEndpointsSchema,
  verifiedAt: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AccountView = z.infer<typeof AccountViewSchema>;

export const AppsListQuerySchema = z.object({
  kind: z.string().min(1).optional(),
});
export type AppsListQuery = z.infer<typeof AppsListQuerySchema>;

export const AppsListResponseSchema = z.object({ apps: z.array(AppViewSchema) });
export type AppsListResponse = z.infer<typeof AppsListResponseSchema>;

export const AppResponseSchema = z.object({ app: AppViewSchema });
export type AppResponse = z.infer<typeof AppResponseSchema>;

export const CreateAppBodySchema = z.object({
  kind: z.string().min(1),
  label: z.string().min(1).max(120),
  values: z.record(z.string(), FieldValueSchema).default({}),
  secrets: z.record(z.string(), z.string()).default({}),
});
export type CreateAppBody = z.infer<typeof CreateAppBodySchema>;

export const UpdateAppBodySchema = z.object({
  label: z.string().min(1).max(120).optional(),
  values: z.record(z.string(), FieldValueSchema).optional(),
  secrets: z.record(z.string(), z.string().nullable()).optional(),
});
export type UpdateAppBody = z.infer<typeof UpdateAppBodySchema>;

export const AccountsListQuerySchema = z.object({
  kind: z.string().min(1).optional(),
  appId: z.string().min(1).optional(),
  status: AccountStatusSchema.optional(),
  scopes: z.string().optional(),
});
export type AccountsListQuery = z.infer<typeof AccountsListQuerySchema>;

export const AccountsListResponseSchema = z.object({ accounts: z.array(AccountViewSchema) });
export type AccountsListResponse = z.infer<typeof AccountsListResponseSchema>;

export const AccountResponseSchema = z.object({ account: AccountViewSchema });
export type AccountResponse = z.infer<typeof AccountResponseSchema>;

export const UpdateAccountBodySchema = z.object({
  label: z.string().min(1).max(120).optional(),
  config: z.record(z.string(), FieldValueSchema).optional(),
});
export type UpdateAccountBody = z.infer<typeof UpdateAccountBodySchema>;

export const ConnectTargetSchema = z.enum(['app', 'account']);

export const ConnectStartBodySchema = z.object({
  target: ConnectTargetSchema,
  kind: z.string().min(1),
  appId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  inputs: z.record(z.string(), FieldValueSchema).optional(),
  scopes: z.array(z.string()).optional(),
});
export type ConnectStartBody = z.infer<typeof ConnectStartBodySchema>;

export const LaunchViewSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('redirect'), url: z.string() }),
  z.object({ kind: z.literal('page'), url: z.string() }),
  z.object({
    kind: z.literal('device'),
    userCode: z.string(),
    verificationUri: z.string(),
    intervalSec: z.number(),
  }),
  z.object({
    kind: z.literal('form'),
    fields: z.array(FieldSpecSchema),
    text: z.string().optional(),
  }),
]);
export type LaunchView = z.infer<typeof LaunchViewSchema>;

export const ConnectStartResponseSchema = z.union([
  z.object({ status: z.literal('completed'), target: ConnectTargetSchema, id: z.string() }),
  z.object({
    status: z.literal('pending'),
    sessionId: z.string(),
    launch: LaunchViewSchema,
    expiresAt: z.number(),
  }),
]);
export type ConnectStartResponse = z.infer<typeof ConnectStartResponseSchema>;

export const SessionEventSchema = z.union([
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('completed'), target: ConnectTargetSchema, id: z.string() }),
  z.object({
    status: z.literal('failed'),
    error: AccountErrorCodeSchema,
    retryAfterSec: z.number().int().nonnegative().optional(),
  }),
]);
export type SessionEvent = z.infer<typeof SessionEventSchema>;

export const ConnectSessionResponseSchema = z.object({ session: SessionEventSchema });
export type ConnectSessionResponse = z.infer<typeof ConnectSessionResponseSchema>;

export const ConnectResumeBodySchema = z.object({
  inputs: z.record(z.string(), FieldValueSchema).default({}),
});
export type ConnectResumeBody = z.infer<typeof ConnectResumeBodySchema>;

export const ConnectResumeResponseSchema = z.object({
  session: SessionEventSchema,
  launch: LaunchViewSchema.optional(),
});
export type ConnectResumeResponse = z.infer<typeof ConnectResumeResponseSchema>;
