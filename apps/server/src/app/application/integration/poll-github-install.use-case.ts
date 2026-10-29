import { Injectable } from '@harnesys/brix';
import type { GithubInstallStatusResponse } from '@harnesys/contracts';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { GithubAppStore } from '../../infra/integration/github/github-app-store.ts';
import { GithubInstallSessionStore } from '../../infra/integration/github/github-install-sessions.ts';
import { adoptSingleGithubInstallation } from './github-install-adopt.ts';

export interface PollGithubInstallInput {
  orgId: string;
  sessionId: string;
}

@Injectable()
export class PollGithubInstallUseCase {
  constructor(
    private readonly sessions: GithubInstallSessionStore,
    private readonly registry: IntegrationRegistryPort,
    private readonly appStore: GithubAppStore,
  ) {}

  async execute(input: PollGithubInstallInput): Promise<GithubInstallStatusResponse> {
    const session = this.sessions.get(input.sessionId);
    if (!session || session.orgId !== input.orgId) {
      return { status: 'expired' };
    }
    if (session.status === 'ready') {
      return { status: 'ready', integrationId: session.integrationId };
    }
    if (session.status === 'denied') {
      return { status: 'denied' };
    }
    if (session.status === 'expired') {
      return { status: 'expired' };
    }
    if (Date.now() >= session.expiresAt) {
      this.sessions.set(input.sessionId, { status: 'expired', orgId: input.orgId });
      return { status: 'expired' };
    }
    const adopted = await adoptSingleGithubInstallation(
      { registry: this.registry, appStore: this.appStore },
      input.orgId,
    );
    if (adopted.status === 'pending') {
      return { status: 'pending' };
    }
    this.sessions.set(input.sessionId, {
      status: 'ready',
      orgId: input.orgId,
      integrationId: adopted.integrationId,
    });
    return { status: 'ready', integrationId: adopted.integrationId };
  }
}
