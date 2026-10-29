import type { SecretResolver, SecretResolveScope } from 'harnesys';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import type { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import type { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import {
  LEGACY_PROVIDER_SECRET_PREFIX,
  legacyProviderSecretKey,
  parseVaultRef,
  vaultStorageKey,
} from '../../domain/secret/vault-keys.ts';

export function createSecretResolver(deps: {
  orgId: string;
  agent: AgentRecord;
  secrets: SecretStorePort;
  providers: LlmProviderPort;
  models: LlmModelPort;
}): SecretResolver {
  const allowed = new Set(deps.agent.secretNames);
  for (const name of providerApiKeySecretNames(
    deps.orgId,
    deps.agent,
    deps.providers,
    deps.models,
  )) {
    allowed.add(name);
  }

  return {
    async resolve(names: string[], _scope: SecretResolveScope): Promise<Record<string, string>> {
      const out: Record<string, string> = {};
      for (const name of names) {
        if (!allowed.has(name)) {
          continue;
        }
        const storageKey = name.startsWith(LEGACY_PROVIDER_SECRET_PREFIX)
          ? name
          : vaultStorageKey('secret', name);
        const value = await deps.secrets.get(deps.orgId, storageKey);
        if (value != null && value !== '') {
          out[name] = value;
        }
      }
      return out;
    },
  };
}

export function providerApiKeySecretNames(
  orgId: string,
  agent: AgentRecord,
  providers: LlmProviderPort,
  models: LlmModelPort,
): string[] {
  const model = models.findById(orgId, agent.modelId);
  if (!model) {
    return [];
  }
  const provider = providers.findById(orgId, model.providerId);
  if (!provider) {
    return [];
  }
  const ref = parseVaultRef(provider.apiKey ?? '');
  if (ref?.kind === 'secret') {
    return [ref.name];
  }
  if (provider.apiKey?.startsWith(LEGACY_PROVIDER_SECRET_PREFIX)) {
    return [provider.apiKey];
  }
  return [legacyProviderSecretKey(provider.id)];
}
