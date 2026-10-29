import { Injectable } from '@harnesys/brix';
import type { GithubInstallStartResponse } from '@harnesys/contracts';
import { GithubAppNotConfiguredException } from '../../domain/integration/integration.error.ts';
import { GithubAppStore } from '../../infra/integration/github/github-app-store.ts';
import { GithubInstallSessionStore } from '../../infra/integration/github/github-install-sessions.ts';

export interface StartGithubInstallInput {
  orgId: string;
}

@Injectable()
export class StartGithubInstallUseCase {
  constructor(
    private readonly sessions: GithubInstallSessionStore,
    private readonly appStore: GithubAppStore,
  ) {}

  async execute(input: StartGithubInstallInput): Promise<GithubInstallStartResponse> {
    const app = this.appStore.require();
    if (!app.appSlug) {
      throw new GithubAppNotConfiguredException();
    }
    const state = createInstallState();
    const sessionId = this.sessions.create(input.orgId, state);
    const installUrl = `https://github.com/apps/${app.appSlug}/installations/new?state=${encodeURIComponent(state)}`;
    return { installUrl, sessionId };
  }
}

function createInstallState(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}
