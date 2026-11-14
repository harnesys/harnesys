import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';

export const IntegrationProviderSchema = z.enum(['google', 'github']);
export type IntegrationProvider = z.infer<typeof IntegrationProviderSchema>;

export const IntegrationStatusSchema = z.enum(['connected', 'expired', 'error']);
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

export const IntegrationSchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  provider: IntegrationProviderSchema,
  status: IntegrationStatusSchema,
  accountLabel: z.string().min(1),
  externalAccountId: z.string().min(1),
  credRef: z.string().min(1),
  providerJson: z.record(z.string(), z.unknown()).nullable().default(null),
  grantedScopes: z.array(z.string()).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  lastRefreshAt: z.string().min(1).nullable(),
});
export type Integration = z.infer<typeof IntegrationSchema>;

export const IntegrationsListResponseSchema = z.object({
  integrations: z.array(IntegrationSchema),
});
export type IntegrationsListResponse = z.infer<typeof IntegrationsListResponseSchema>;

export const DisconnectIntegrationResponseSchema = z.object({
  detachedSources: z.number().int().nonnegative(),
});
export type DisconnectIntegrationResponse = z.infer<typeof DisconnectIntegrationResponseSchema>;

export const GithubContentsAccessSchema = z.enum(['write', 'read', 'none']);
export type GithubContentsAccess = z.infer<typeof GithubContentsAccessSchema>;

export const GithubAppStatusResponseSchema = z.object({
  configured: z.boolean(),
  appSlug: z.string().min(1).nullable(),
  contentsAccess: GithubContentsAccessSchema,
});
export type GithubAppStatusResponse = z.infer<typeof GithubAppStatusResponseSchema>;

export const GithubInstallStartResponseSchema = z.object({
  installUrl: z.string().min(1),
  sessionId: z.string().min(1),
});
export type GithubInstallStartResponse = z.infer<typeof GithubInstallStartResponseSchema>;

export const GithubManifestStartResponseSchema = z.object({
  popupUrl: z.string().min(1),
  sessionId: z.string().min(1),
});
export type GithubManifestStartResponse = z.infer<typeof GithubManifestStartResponseSchema>;

export const GithubManifestStartBodySchema = z.object({
  name: z.string().min(1).max(64).optional(),
});
export type GithubManifestStartBody = z.infer<typeof GithubManifestStartBodySchema>;

export const GithubInstallStatusQuerySchema = z.object({
  sessionId: z.string().min(1),
});
export type GithubInstallStatusQuery = z.infer<typeof GithubInstallStatusQuerySchema>;

export const GithubInstallStatusResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('denied') }),
  z.object({ status: z.literal('expired') }),
  z.object({
    status: z.literal('ready'),
    integrationId: z.string().uuid(),
  }),
]);
export type GithubInstallStatusResponse = z.infer<typeof GithubInstallStatusResponseSchema>;

export const GithubRepoItemSchema = z.object({
  name: z.string().min(1),
  fullName: z.string().min(1),
  private: z.boolean(),
  defaultBranch: z.string().min(1),
  updatedAt: z.string().min(1).nullable(),
});
export type GithubRepoItem = z.infer<typeof GithubRepoItemSchema>;

export const GithubReposResponseSchema = z.object({
  repos: z.array(GithubRepoItemSchema),
});
export type GithubReposResponse = z.infer<typeof GithubReposResponseSchema>;

export const GithubReposQuerySchema = z.object({
  integrationId: z.string().uuid(),
});
export type GithubReposQuery = z.infer<typeof GithubReposQuerySchema>;

export const GoogleOAuthServiceSchema = z.enum([
  'drive',
  'gmail',
  'calendar',
  'youtube',
  'sheets',
  'docs',
  'search_console',
]);
export type GoogleOAuthService = z.infer<typeof GoogleOAuthServiceSchema>;

export const GoogleOAuthLoopbackStartBodySchema = z
  .object({
    services: z.array(GoogleOAuthServiceSchema).min(1),
  })
  .refine((body) => !(body.services.includes('youtube') && body.services.length > 1), {
    message:
      'YouTube must be requested on its own — Google rejects YouTube scopes combined with other services',
  });
export type GoogleOAuthLoopbackStartBody = z.infer<typeof GoogleOAuthLoopbackStartBodySchema>;
