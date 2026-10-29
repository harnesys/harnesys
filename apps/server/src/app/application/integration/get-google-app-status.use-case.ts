import type { ServerBinding } from '@harnesys/brix';
import { Configuration, Injectable } from '@harnesys/brix';
import type { GoogleAppConfigStatusResponse } from '@harnesys/contracts';
import type { AppConfig } from '../../../config.schema.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import {
  googleRedirectUri,
  loadGoogleAppConfig,
} from '../../infra/integration/google/google-app-config.ts';

type ServerAppConfig = AppConfig & { server: ServerBinding };

@Injectable()
export class GetGoogleAppStatusUseCase {
  constructor(
    private readonly secrets: SecretStorePort,
    @Configuration() private readonly config: ServerAppConfig,
  ) {}

  async execute(orgId: string): Promise<GoogleAppConfigStatusResponse> {
    const config = await loadGoogleAppConfig(this.secrets, orgId);
    return {
      configured: config !== null,
      redirectUri: googleRedirectUri(this.config),
      clientId: config?.clientId ?? '',
      hasClientSecret: Boolean(config?.clientSecret),
      hasApiKey: Boolean(config?.apiKey),
      hasAppId: Boolean(config?.appId),
    };
  }
}
