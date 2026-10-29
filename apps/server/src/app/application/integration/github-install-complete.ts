import {
  type IntegrationRecord,
  IntegrationRegistryPort,
} from '../../domain/integration/integration-registry.port.ts';

export const GITHUB_CRED_REF = 'github-app';

export interface GithubInstallIdentity {
  accountLogin: string;
  installationId: number;
  appSlug: string;
}

export function upsertGithubIntegration(
  registry: IntegrationRegistryPort,
  orgId: string,
  identity: GithubInstallIdentity,
): IntegrationRecord {
  const now = new Date().toISOString();
  const existing = registry.findByExternalAccount(orgId, 'github', identity.accountLogin);
  const providerJson = {
    installationId: identity.installationId,
    appSlug: identity.appSlug,
    gitCredentialKey:
      typeof existing?.providerJson?.gitCredentialKey === 'string' &&
      existing.providerJson.gitCredentialKey !== ''
        ? existing.providerJson.gitCredentialKey
        : crypto.randomUUID(),
  };
  if (existing) {
    return registry.update(orgId, existing.id, {
      status: 'connected',
      accountLabel: identity.accountLogin,
      credRef: existing.credRef || GITHUB_CRED_REF,
      providerJson,
      lastRefreshAt: now,
    });
  }
  const record: IntegrationRecord = {
    id: crypto.randomUUID(),
    orgId,
    provider: 'github',
    status: 'connected',
    accountLabel: identity.accountLogin,
    externalAccountId: identity.accountLogin,
    credRef: GITHUB_CRED_REF,
    providerJson,
    createdAt: now,
    updatedAt: now,
    lastRefreshAt: now,
  };
  registry.insert(record);
  return record;
}
