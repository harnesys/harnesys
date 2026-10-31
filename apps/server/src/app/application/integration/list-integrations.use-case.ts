import { Injectable } from '@harnesys/brix';
import type { Integration, IntegrationsListResponse } from '@harnesys/contracts';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { loadGoogleTokens } from '../../infra/integration/google/google-token-access.ts';

export interface ListIntegrationsInput {
  orgId: string;
}

@Injectable()
export class ListIntegrationsUseCase {
  constructor(
    private readonly registry: IntegrationRegistryPort,
    private readonly secrets: SecretStorePort,
  ) {}

  async execute(input: ListIntegrationsInput): Promise<IntegrationsListResponse> {
    const integrations: Integration[] = [];
    for (const record of this.registry.list(input.orgId)) {
      if (record.provider !== 'google') {
        integrations.push(record);
        continue;
      }
      integrations.push({ ...record, grantedScopes: await grantedScopes(this.secrets, record) });
    }
    return { integrations };
  }
}

async function grantedScopes(
  secrets: SecretStorePort,
  record: Integration,
): Promise<string[] | undefined> {
  const tokens = await loadGoogleTokens(secrets, record.orgId, record.credRef);
  const scopes = (tokens?.scope ?? '').split(' ').filter((scope) => scope !== '');
  return scopes.length > 0 ? scopes : undefined;
}
