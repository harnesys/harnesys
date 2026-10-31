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

export const ConnectorCapabilitySchema = z.enum([
  'drive',
  'calendar',
  'gmail',
  'repos',
  'issues',
  'ci',
]);
export type ConnectorCapability = z.infer<typeof ConnectorCapabilitySchema>;
export const ConnectorContentSchema = z.enum(['drive-folders', 'github-repos', 'none']);
export type ConnectorContent = z.infer<typeof ConnectorContentSchema>;

export const ConnectorDescriptorSchema = z.object({
  id: z.enum(['google', 'github', 'slack', 'notion', 'linear', 'discord', 'telegram']),
  name: z.string().min(1),
  tagline: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1),
  auth: z.object({
    kind: z.enum(['oauth-browser', 'github-app-install']),
  }),
  content: ConnectorContentSchema,
  capabilities: z.array(ConnectorCapabilitySchema),
  status: z.enum(['available', 'planned']),
});
export type ConnectorDescriptor = z.infer<typeof ConnectorDescriptorSchema>;

export const CONNECTOR_CATALOG: ConnectorDescriptor[] = [
  {
    id: 'google',
    name: 'Google',
    tagline: 'Drive, Calendar, and Gmail for agents',
    description:
      'Connect a Google account to attach Drive folders as sources and give agents Calendar, Gmail, and Drive tools. One Google Cloud app per organization authorizes the access; Harnesys keeps the token encrypted and refreshes it automatically. Sync runs in the background, and agents read attached folders on demand.',
    icon: 'google',
    auth: { kind: 'oauth-browser' },
    content: 'drive-folders',
    capabilities: ['drive', 'calendar', 'gmail'],
    status: 'available',
  },
  {
    id: 'github',
    name: 'GitHub',
    tagline: 'Repos, issues, PRs, and CI',
    description:
      'Install the Harnesys GitHub App to attach repositories as sources and give agents tools for repositories, issues, pull requests, and CI. The app requests read access to the repositories you pick; write access to contents is only needed when agents push code. A fresh installation token is minted for every git operation.',
    icon: 'github',
    auth: { kind: 'github-app-install' },
    content: 'github-repos',
    capabilities: ['repos', 'issues', 'ci'],
    status: 'available',
  },
  {
    id: 'slack',
    name: 'Slack',
    tagline: 'Channels and DMs for agents',
    description:
      'Attach Slack channels as sources and let agents read conversations, answer questions, and send messages. Planned for a future release.',
    icon: 'slack',
    auth: { kind: 'oauth-browser' },
    content: 'none',
    capabilities: [],
    status: 'planned',
  },
  {
    id: 'notion',
    name: 'Notion',
    tagline: 'Docs and databases for agents',
    description:
      'Connect a Notion workspace to attach pages and databases as sources so agents can search and cite them. Planned for a future release.',
    icon: 'notion',
    auth: { kind: 'oauth-browser' },
    content: 'none',
    capabilities: [],
    status: 'planned',
  },
  {
    id: 'linear',
    name: 'Linear',
    tagline: 'Issues and projects for agents',
    description:
      'Connect a Linear workspace to attach issues and projects as sources and let agents triage and update work. Planned for a future release.',
    icon: 'linear',
    auth: { kind: 'oauth-browser' },
    content: 'none',
    capabilities: [],
    status: 'planned',
  },
  {
    id: 'discord',
    name: 'Discord',
    tagline: 'Servers and channels for agents',
    description:
      'Attach Discord servers and channels as sources so agents can read discussions and post replies. Planned for a future release.',
    icon: 'discord',
    auth: { kind: 'oauth-browser' },
    content: 'none',
    capabilities: [],
    status: 'planned',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    tagline: 'Direct chats with agents',
    description:
      'Connect a Telegram bot for direct chats where agents answer questions and act on attached sources. Planned for a future release.',
    icon: 'telegram',
    auth: { kind: 'oauth-browser' },
    content: 'none',
    capabilities: [],
    status: 'planned',
  },
];

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
