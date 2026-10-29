import type { ServerBinding } from '@harnesys/brix';
import { Configuration, Injectable } from '@harnesys/brix';
import type { GoogleAppConfigBody, GoogleAppConfigStatusResponse } from '@harnesys/contracts';
import type { AppConfig } from '../../../config.schema.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import {
  googleRedirectUri,
  loadGoogleAppConfig,
  saveGoogleAppConfig,
} from '../../infra/integration/google/google-app-config.ts';

type ServerAppConfig = AppConfig & { server: ServerBinding };

@Injectable()
export class SaveGoogleAppConfigUseCase {
  constructor(
    private readonly secrets: SecretStorePort,
    @Configuration() private readonly config: ServerAppConfig,
  ) {}

  async execute(
    input: GoogleAppConfigBody & { orgId: string },
  ): Promise<GoogleAppConfigStatusResponse> {
    await saveGoogleAppConfig(this.secrets, input.orgId, {
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      apiKey: input.apiKey ?? '',
      appId: input.appId ?? '',
    });
    const saved = await loadGoogleAppConfig(this.secrets, input.orgId);
    return {
      configured: saved !== null,
      redirectUri: googleRedirectUri(this.config),
      clientId: saved?.clientId ?? '',
      hasClientSecret: Boolean(saved?.clientSecret),
      hasApiKey: Boolean(saved?.apiKey),
      hasAppId: Boolean(saved?.appId),
    };
  }
}
