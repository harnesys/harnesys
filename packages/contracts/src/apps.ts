import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';

export const AppKindSchema = z.string().min(1).max(64);
export type AppKind = z.infer<typeof AppKindSchema>;

export const AppStatusSchema = z.enum(['configured', 'invalid']);
export type AppStatus = z.infer<typeof AppStatusSchema>;

export const AppKindFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  secret: z.boolean(),
  required: z.boolean(),
  multiline: z.boolean(),
  placeholder: z.string(),
});
export type AppKindField = z.infer<typeof AppKindFieldSchema>;

export const AppKindSpecSchema = z.object({
  kind: AppKindSchema,
  label: z.string().min(1),
  description: z.string(),
  fields: z.array(AppKindFieldSchema),
});
export type AppKindSpec = z.infer<typeof AppKindSpecSchema>;

export const AppKindsResponseSchema = z.object({
  kinds: z.array(AppKindSpecSchema),
});
export type AppKindsResponse = z.infer<typeof AppKindsResponseSchema>;

export const AppSchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  kind: AppKindSchema,
  label: z.string().min(1),
  status: AppStatusSchema,
  values: z.record(z.string(), z.string()),
  secretFields: z.array(z.string()),
  accountCount: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type App = z.infer<typeof AppSchema>;

export const AppsListQuerySchema = z.object({
  kind: AppKindSchema.optional(),
});
export type AppsListQuery = z.infer<typeof AppsListQuerySchema>;

export const AppsListResponseSchema = z.object({
  apps: z.array(AppSchema),
});
export type AppsListResponse = z.infer<typeof AppsListResponseSchema>;

export const AppResponseSchema = z.object({
  app: AppSchema,
});
export type AppResponse = z.infer<typeof AppResponseSchema>;

export const CreateAppBodySchema = z.object({
  kind: AppKindSchema,
  label: z.string().min(1).max(120),
  values: z.record(z.string(), z.string()).default({}),
  secrets: z.record(z.string(), z.string()).default({}),
});
export type CreateAppBody = z.infer<typeof CreateAppBodySchema>;

export const UpdateAppBodySchema = z.object({
  label: z.string().min(1).max(120).optional(),
  values: z.record(z.string(), z.string()).optional(),
  secrets: z.record(z.string(), z.string()).optional(),
});
export type UpdateAppBody = z.infer<typeof UpdateAppBodySchema>;

export const AccountKindSchema = z.string().min(1).max(64);
export type AccountKind = z.infer<typeof AccountKindSchema>;

export const AccountStatusSchema = z.enum(['connected', 'expired', 'error', 'pending']);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const AccountSchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  appId: z.string().uuid().nullable(),
  kind: AccountKindSchema,
  externalAccountId: z.string().min(1),
  label: z.string().min(1),
  status: AccountStatusSchema,
  scopes: z.array(z.string()),
  scopeKey: z.string().min(1),
  hasCredentials: z.boolean(),
  lastError: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type Account = z.infer<typeof AccountSchema>;

export const AccountsListQuerySchema = z.object({
  kind: AccountKindSchema.optional(),
  appId: z.string().uuid().optional(),
});
export type AccountsListQuery = z.infer<typeof AccountsListQuerySchema>;

export const AccountsListResponseSchema = z.object({
  accounts: z.array(AccountSchema),
});
export type AccountsListResponse = z.infer<typeof AccountsListResponseSchema>;

export const AccountResponseSchema = z.object({
  account: AccountSchema,
});
export type AccountResponse = z.infer<typeof AccountResponseSchema>;

export const RegisterAccountBodySchema = z.object({
  appId: z.string().uuid().nullable().default(null),
  kind: AccountKindSchema,
  externalAccountId: z.string().min(1).max(255),
  label: z.string().min(1).max(120),
  scopes: z.array(z.string().min(1)).default([]),
  credentials: z.record(z.string(), z.string()).default({}),
});
export type RegisterAccountBody = z.infer<typeof RegisterAccountBodySchema>;

export const RegisterAccountResponseSchema = z.object({
  account: AccountSchema,
  created: z.boolean(),
});
export type RegisterAccountResponse = z.infer<typeof RegisterAccountResponseSchema>;

export const UpdateAccountBodySchema = z.object({
  label: z.string().min(1).max(120).optional(),
  status: AccountStatusSchema.optional(),
  lastError: z.string().max(500).nullable().optional(),
});
export type UpdateAccountBody = z.infer<typeof UpdateAccountBodySchema>;
