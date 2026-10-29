import { Injectable } from '@harnesys/brix';
import type { GooglePickerSessionResponse } from '@harnesys/contracts';
import {
  IntegrationNotConfiguredException,
  IntegrationNotConnectedException,
  IntegrationNotFoundException,
} from '../../domain/integration/integration.error.ts';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { IntegrationTokenPort } from '../../domain/integration/integration-token.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { loadGoogleAppConfig } from '../../infra/integration/google/google-app-config.ts';

export interface GetGooglePickerSessionInput {
  orgId: string;
  integrationId: string;
}

@Injectable()
export class GetGooglePickerSessionUseCase {
  constructor(
    private readonly registry: IntegrationRegistryPort,
    private readonly tokens: IntegrationTokenPort,
    private readonly secrets: SecretStorePort,
  ) {}

  async execute(input: GetGooglePickerSessionInput): Promise<GooglePickerSessionResponse> {
    const appConfig = await loadGoogleAppConfig(this.secrets, input.orgId);
    if (!appConfig?.apiKey || !appConfig.appId) {
      throw new IntegrationNotConfiguredException(
        'Google Picker needs the API key and App ID from your Google Cloud app — add them in Settings → Connectors → Google',
      );
    }
    const integration = this.registry.findById(input.orgId, input.integrationId);
    if (!integration) {
      throw new IntegrationNotFoundException(input.orgId, input.integrationId);
    }
    if (integration.status !== 'connected') {
      throw new IntegrationNotConnectedException(input.orgId, input.integrationId);
    }
    const accessToken = await this.tokens.getAccessToken(input.orgId, input.integrationId);
    return { accessToken, apiKey: appConfig.apiKey, appId: appConfig.appId };
  }
}
