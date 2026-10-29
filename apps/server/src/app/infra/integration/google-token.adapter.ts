import { Injectable } from '@harnesys/brix';
import {
  IntegrationNotConnectedException,
  IntegrationNotFoundException,
  IntegrationTokenRefreshFailedException,
} from '../../domain/integration/integration.error.ts';
import {
  type IntegrationRecord,
  IntegrationRegistryPort,
} from '../../domain/integration/integration-registry.port.ts';
import { IntegrationTokenPort } from '../../domain/integration/integration-token.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import type { GoogleOAuthClientConfig } from './google/google-oauth-device.ts';
import {
  getValidGoogleAccessToken,
  loadGoogleOAuthClient,
  loadGoogleTokens,
} from './google/google-token-access.ts';

@Injectable()
export class GoogleTokenAdapter extends IntegrationTokenPort {
  constructor(
    private readonly secrets: SecretStorePort,
    private readonly registry: IntegrationRegistryPort,
  ) {
    super();
  }

  async getAccessToken(orgId: string, integrationId: string): Promise<string> {
    const integration = this.requireIntegration(orgId, integrationId);
    if (integration.status !== 'connected') {
      throw new IntegrationNotConnectedException(orgId, integrationId);
    }
    let client: GoogleOAuthClientConfig;
    try {
      client = await loadGoogleOAuthClient(this.secrets, orgId);
    } catch (err) {
      throw new IntegrationTokenRefreshFailedException(orgId, integrationId, errorCause(err));
    }
    try {
      return await getValidGoogleAccessToken(this.secrets, orgId, integration.credRef, client);
    } catch (err) {
      throw new IntegrationTokenRefreshFailedException(orgId, integrationId, errorCause(err));
    }
  }

  async getGrantedScopes(orgId: string, integrationId: string): Promise<ReadonlySet<string>> {
    const integration = this.requireIntegration(orgId, integrationId);
    const tokens = await loadGoogleTokens(this.secrets, orgId, integration.credRef);
    if (!tokens?.scope) {
      return new Set();
    }
    return new Set(tokens.scope.split(' ').filter((scope) => scope !== ''));
  }

  private requireIntegration(orgId: string, integrationId: string): IntegrationRecord {
    const record = this.registry.findById(orgId, integrationId);
    if (!record) {
      throw new IntegrationNotFoundException(orgId, integrationId);
    }
    return record;
  }
}

function errorCause(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}
