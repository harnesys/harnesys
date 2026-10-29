import { Injectable } from '@harnesys/brix';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { signGithubAppJwt } from '../../infra/integration/github/app-jwt.ts';
import { getInstallation } from '../../infra/integration/github/github-api.ts';
import { GithubAppStore } from '../../infra/integration/github/github-app-store.ts';
import { GithubInstallSessionStore } from '../../infra/integration/github/github-install-sessions.ts';
import { adoptSingleGithubInstallation } from './github-install-adopt.ts';
import { upsertGithubIntegration } from './github-install-complete.ts';

export interface GithubInstallCallbackInput {
  installationId?: string;
  error?: string;
  state?: string;
}

export type GithubInstallCallbackResult =
  | { status: 'ready' }
  | { status: 'denied' }
  | { status: 'expired' }
  | { status: 'pending' };

@Injectable()
export class GithubInstallCallbackUseCase {
  constructor(
    private readonly sessions: GithubInstallSessionStore,
    private readonly registry: IntegrationRegistryPort,
    private readonly appStore: GithubAppStore,
  ) {}

  async execute(input: GithubInstallCallbackInput): Promise<GithubInstallCallbackResult> {
    if (input.error) {
      return { status: 'denied' };
    }
    const found = input.state ? this.sessions.findByState(input.state) : null;
    if (!found || Date.now() >= found.session.expiresAt) {
      return { status: 'expired' };
    }
    const { sessionId, session } = found;
    const installationId = Number(input.installationId);
    if (input.installationId && Number.isInteger(installationId) && installationId > 0) {
      const app = this.appStore.require();
      const jwt = signGithubAppJwt({ appId: app.appId, privateKey: app.privateKey });
      const installation = await getInstallation(jwt, installationId);
      const integration = upsertGithubIntegration(this.registry, session.orgId, {
        accountLogin: installation.accountLogin,
        installationId: installation.installationId,
        appSlug: installation.appSlug ?? app.appSlug,
      });
      this.sessions.set(sessionId, {
        status: 'ready',
        orgId: session.orgId,
        integrationId: integration.id,
      });
      return { status: 'ready' };
    }
    const adopted = await adoptSingleGithubInstallation(
      { registry: this.registry, appStore: this.appStore },
      session.orgId,
    );
    if (adopted.status === 'pending') {
      return { status: 'pending' };
    }
    this.sessions.set(sessionId, {
      status: 'ready',
      orgId: session.orgId,
      integrationId: adopted.integrationId,
    });
    return { status: 'ready' };
  }
}
