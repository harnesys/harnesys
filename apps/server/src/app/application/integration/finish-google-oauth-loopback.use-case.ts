import { BadRequestException, Configuration, Injectable, type ServerBinding } from '@harnesys/brix';
import type { AppConfig } from '../../../config.schema.ts';
import { IntegrationProviderErrorException } from '../../domain/integration/integration.error.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import {
  googleRedirectUri,
  requireGoogleAppConfig,
} from '../../infra/integration/google/google-app-config.ts';
import { exchangeLoopbackCode } from '../../infra/integration/google/google-oauth-device.ts';
import { GoogleOAuthSessionStore } from '../../infra/integration/google/google-oauth-sessions.ts';
import { FinalizeGoogleIntegrationUseCase } from './finalize-google-integration.use-case.ts';

export interface FinishGoogleOAuthLoopbackInput {
  code?: string;
  state?: string;
  error?: string;
}

export interface FinishGoogleOAuthLoopbackResult {
  status: 'ready' | 'denied';
}

type LoopbackServerConfig = AppConfig & { server: ServerBinding };

@Injectable()
export class FinishGoogleOAuthLoopbackUseCase {
  constructor(
    private readonly sessions: GoogleOAuthSessionStore,
    private readonly finalize: FinalizeGoogleIntegrationUseCase,
    private readonly secrets: SecretStorePort,
    @Configuration() private readonly config: LoopbackServerConfig,
  ) {}

  async execute(input: FinishGoogleOAuthLoopbackInput): Promise<FinishGoogleOAuthLoopbackResult> {
    if (input.error) {
      const denied = input.state ? this.sessions.findByState(input.state) : null;
      if (denied) {
        this.sessions.set(denied.sessionId, { status: 'denied', orgId: denied.session.orgId });
      }
      return { status: 'denied' };
    }
    if (!input.code || !input.state) {
      throw new BadRequestException('Google callback missing code/state');
    }
    const found = this.sessions.findByState(input.state);
    if (!found) {
      throw new BadRequestException('Unknown or consumed Google OAuth session');
    }
    const { sessionId, session } = found;
    if (Date.now() >= session.expiresAt) {
      this.sessions.set(sessionId, { status: 'expired', orgId: session.orgId });
      throw new BadRequestException('Google OAuth session expired; start again');
    }
    const client = await requireGoogleAppConfig(this.secrets, session.orgId);
    try {
      const tokens = await exchangeLoopbackCode({
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        code: input.code,
        verifier: session.verifier,
        redirectUri: googleRedirectUri(this.config),
      });
      const { integration, credRef } = await this.finalize.execute({
        orgId: session.orgId,
        tokens,
      });
      this.sessions.set(sessionId, {
        status: 'ready',
        orgId: session.orgId,
        tokens,
        credRef,
        integrationId: integration.id,
      });
      return { status: 'ready' };
    } catch (err) {
      this.sessions.set(sessionId, { status: 'expired', orgId: session.orgId });
      throw new IntegrationProviderErrorException(
        'google',
        err instanceof Error ? err.message : 'authorization failed',
      );
    }
  }
}
