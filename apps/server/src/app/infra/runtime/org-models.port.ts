import {
  isDriver,
  type ModelBinding,
  ModelLookupError,
  type ModelRecord,
  type ModelsPort,
} from 'harnesys';
import type { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import type { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import {
  legacyProviderSecretKey,
  parseVaultRef,
  vaultStorageKey,
} from '../../domain/secret/vault-keys.ts';

export function createOrgModelsPort(
  orgId: string,
  providers: LlmProviderPort,
  models: LlmModelPort,
  secrets: SecretStorePort,
): ModelsPort {
  return {
    get: async (providerName: string, modelName: string): Promise<ModelBinding> => {
      const provider = providers.findByName(orgId, providerName);
      if (!provider) {
        return Promise.reject(new ModelLookupError(`provider ${providerName} not found`));
      }
      if (!provider.enabled) {
        return Promise.reject(new ModelLookupError(`provider ${providerName} is disabled`));
      }
      if (!isDriver(provider.driver)) {
        return Promise.reject(new ModelLookupError(`unknown driver ${provider.driver}`));
      }
      const model = models.findByProviderAndName(orgId, provider.id, modelName);
      if (!model) {
        return Promise.reject(
          new ModelLookupError(`model ${modelName} not found in provider ${providerName}`),
        );
      }
      const metadata =
        typeof model.metadata === 'object' && model.metadata !== null ? model.metadata : {};
      const record = { ...metadata, id: model.id, name: model.name } as ModelRecord;
      const apiKey = await resolveProviderApiKey(secrets, orgId, provider.id, provider.apiKey);
      return {
        name: provider.name,
        driver: provider.driver,
        apiUrl: provider.apiUrl ?? undefined,
        headers: provider.headers,
        apiKey,
        enabled: provider.enabled,
        model: { ...record, name: record.name },
      };
    },
  };
}

async function resolveProviderApiKey(
  secrets: SecretStorePort,
  orgId: string,
  providerId: string,
  apiKeyColumn: string | null,
): Promise<string | undefined> {
  const ref = parseVaultRef(apiKeyColumn ?? '');
  if (ref?.kind === 'secret') {
    const value = await secrets.get(orgId, vaultStorageKey('secret', ref.name));
    if (value != null && value !== '') {
      return value;
    }
    return undefined;
  }
  const legacy = await secrets.get(orgId, legacyProviderSecretKey(providerId));
  if (legacy != null && legacy !== '') {
    return legacy;
  }
  if (apiKeyColumn && !parseVaultRef(apiKeyColumn)) {
    return apiKeyColumn;
  }
  return undefined;
}
