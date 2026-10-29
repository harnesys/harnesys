import { Configuration, Injectable, type ServerBinding } from '@harnesys/brix';
import type { GoogleOAuthLoopbackStartResponse } from '@harnesys/contracts';
import type { AppConfig } from '../../../config.schema.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import {
  googleRedirectUri,
  requireGoogleAppConfig,
} from '../../infra/integration/google/google-app-config.ts';
import {
  buildLoopbackAuthorizationUrl,
  createOAuthState,
  createPkceVerifier,
  GOOGLE_OAUTH_LOOPBACK_SESSION_TTL_MS,
  pkceChallengeS256,
} from '../../infra/integration/google/google-oauth-device.ts';
import { GoogleOAuthSessionStore } from '../../infra/integration/google/google-oauth-sessions.ts';

export interface StartGoogleOAuthLoopbackInput {
  orgId: string;
}

type LoopbackServerConfig = AppConfig & { server: ServerBinding };

@Injectable()
export class StartGoogleOAuthLoopbackUseCase {
  constructor(
    private readonly sessions: GoogleOAuthSessionStore,
    private readonly secrets: SecretStorePort,
    @Configuration() private readonly config: LoopbackServerConfig,
  ) {}

  async execute(input: StartGoogleOAuthLoopbackInput): Promise<GoogleOAuthLoopbackStartResponse> {
    const client = await requireGoogleAppConfig(this.secrets, input.orgId);
    const verifier = createPkceVerifier();
    const state = createOAuthState();
    const expiresAt = Date.now() + GOOGLE_OAUTH_LOOPBACK_SESSION_TTL_MS;
    const authUrl = buildLoopbackAuthorizationUrl({
      clientId: client.clientId,
      redirectUri: googleRedirectUri(this.config),
      state,
      challenge: await pkceChallengeS256(verifier),
    });
    const sessionId = this.sessions.createLoopback(input.orgId, { state, verifier, expiresAt });
    return {
      flow: 'loopback',
      sessionId,
      authUrl,
      expiresIn: Math.floor(GOOGLE_OAUTH_LOOPBACK_SESSION_TTL_MS / 1000),
    };
  }
}
