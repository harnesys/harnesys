import { Injectable } from '@harnesys/brix';
import {
  IntegrationNotConnectedException,
  IntegrationNotFoundException,
  IntegrationProviderErrorException,
} from '../../../domain/integration/integration.error.ts';
import { IntegrationRegistryPort } from '../../../domain/integration/integration-registry.port.ts';
import { IntegrationTokenPort } from '../../../domain/integration/integration-token.port.ts';
import { signGithubAppJwt } from './app-jwt.ts';
import { GithubAppStore } from './github-app-store.ts';
import { InstallationTokenStore } from './installation-token.ts';

@Injectable()
export class GithubTokenAdapter extends IntegrationTokenPort {
  private readonly installationTokens = new InstallationTokenStore();

  constructor(
    private readonly registry: IntegrationRegistryPort,
    private readonly appStore: GithubAppStore,
  ) {
    super();
  }

  async getAccessToken(orgId: string, integrationId: string): Promise<string> {
    const integration = this.requireIntegration(orgId, integrationId);
    if (integration.status !== 'connected') {
      throw new IntegrationNotConnectedException(orgId, integrationId);
    }
    const app = this.appStore.require();
    const jwt = signGithubAppJwt({ appId: app.appId, privateKey: app.privateKey });
    const token = await this.installationTokens.get({
      integrationId,
      installationId: installationIdOf(integration),
      jwt,
    });
    return token.token;
  }

  async getGrantedScopes(orgId: string, integrationId: string): Promise<ReadonlySet<string>> {
    try {
      const integration = this.registry.findById(orgId, integrationId);
      if (integration?.status !== 'connected') {
        return new Set();
      }
      const app = this.appStore.require();
      const jwt = signGithubAppJwt({ appId: app.appId, privateKey: app.privateKey });
      const token = await this.installationTokens.get({
        integrationId,
        installationId: installationIdOf(integration),
        jwt,
      });
      return new Set(Object.keys(token.permissions));
    } catch {
      return new Set();
    }
  }

  private requireIntegration(orgId: string, integrationId: string) {
    const record = this.registry.findById(orgId, integrationId);
    if (!record) {
      throw new IntegrationNotFoundException(orgId, integrationId);
    }
    return record;
  }
}

function installationIdOf(integration: { providerJson: Record<string, unknown> | null }): number {
  const raw = integration.providerJson?.installationId;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new IntegrationProviderErrorException(
      'github',
      'integration has no installation id in provider data',
    );
  }
  return value;
}
