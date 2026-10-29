import type { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';

interface ServerConfig {
  server?: { port?: number };
}

export function ensureGitCredentialKey(
  registry: IntegrationRegistryPort,
  orgId: string,
  integrationId: string,
): string | undefined {
  const record = registry.findById(orgId, integrationId);
  if (record?.provider !== 'github') {
    return undefined;
  }
  const existing = record.providerJson?.gitCredentialKey;
  if (typeof existing === 'string' && existing !== '') {
    return existing;
  }
  const key = crypto.randomUUID();
  registry.update(orgId, record.id, {
    providerJson: { ...record.providerJson, gitCredentialKey: key },
  });
  return key;
}

export function gitCredentialUrl(config: ServerConfig, integrationId: string, key: string): string {
  const port = config.server?.port ?? 47474;
  const params = new URLSearchParams({ integrationId, key });
  return `http://127.0.0.1:${port}/api/integrations/github/git-credential?${params.toString()}`;
}
