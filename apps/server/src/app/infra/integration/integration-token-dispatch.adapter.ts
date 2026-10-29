import { Injectable } from '@harnesys/brix';
import {
  IntegrationNotFoundException,
  IntegrationProviderErrorException,
} from '../../domain/integration/integration.error.ts';
import {
  type IntegrationRecord,
  IntegrationRegistryPort,
} from '../../domain/integration/integration-registry.port.ts';
import { IntegrationTokenPort } from '../../domain/integration/integration-token.port.ts';
import { GithubTokenAdapter } from './github/github-token.adapter.ts';
import { GoogleTokenAdapter } from './google-token.adapter.ts';

@Injectable()
export class IntegrationTokenDispatchAdapter extends IntegrationTokenPort {
  constructor(
    private readonly registry: IntegrationRegistryPort,
    private readonly google: GoogleTokenAdapter,
    private readonly github: GithubTokenAdapter,
  ) {
    super();
  }

  async getAccessToken(orgId: string, integrationId: string): Promise<string> {
    const integration = this.requireIntegration(orgId, integrationId);
    return this.forProvider(integration).getAccessToken(orgId, integrationId);
  }

  async getGrantedScopes(orgId: string, integrationId: string): Promise<ReadonlySet<string>> {
    const integration = this.requireIntegration(orgId, integrationId);
    return this.forProvider(integration).getGrantedScopes(orgId, integrationId);
  }

  private forProvider(integration: IntegrationRecord): IntegrationTokenPort {
    if (integration.provider === 'google') {
      return this.google;
    }
    if (integration.provider === 'github') {
      return this.github;
    }
    throw new IntegrationProviderErrorException(
      integration.provider,
      'no token adapter registered',
    );
  }

  private requireIntegration(orgId: string, integrationId: string): IntegrationRecord {
    const record = this.registry.findById(orgId, integrationId);
    if (!record) {
      throw new IntegrationNotFoundException(orgId, integrationId);
    }
    return record;
  }
}
