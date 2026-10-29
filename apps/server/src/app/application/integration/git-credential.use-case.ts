import { Injectable } from '@harnesys/brix';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { IntegrationTokenPort } from '../../domain/integration/integration-token.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';

export interface GitCredentialInput {
  integrationId: string;
  key: string;
}

@Injectable()
export class GitCredentialUseCase {
  constructor(
    private readonly orgs: OrgMachineStore,
    private readonly registry: IntegrationRegistryPort,
    private readonly tokens: IntegrationTokenPort,
  ) {}

  async execute(input: GitCredentialInput): Promise<string | null> {
    for (const org of this.orgs.list()) {
      const record = this.registry.list(org.orgId).find((item) => item.id === input.integrationId);
      if (!record) {
        continue;
      }
      if (
        record.provider !== 'github' ||
        record.status !== 'connected' ||
        record.providerJson?.gitCredentialKey !== input.key
      ) {
        return null;
      }
      return this.tokens.getAccessToken(org.orgId, record.id);
    }
    return null;
  }
}
