import { Injectable } from '@harnesys/brix';
import { GithubManifestSessionStore } from '../../infra/integration/github/github-manifest-sessions.ts';

export const DEFAULT_GITHUB_APP_NAME = 'Harnesys';

export interface StartGithubManifestInput {
  orgId: string;
  origin: string;
  name?: string;
}

export interface StartGithubManifestResult {
  popupUrl: string;
  sessionId: string;
}

@Injectable()
export class StartGithubManifestUseCase {
  constructor(private readonly sessions: GithubManifestSessionStore) {}

  execute(input: StartGithubManifestInput): StartGithubManifestResult {
    const name = input.name?.trim() || DEFAULT_GITHUB_APP_NAME;
    const ticket = this.sessions.create(input.orgId, input.origin, name);
    return {
      popupUrl: `${input.origin.replace(/\/+$/, '')}/api/integrations/github/manifest/connect?ticket=${ticket}`,
      sessionId: ticket,
    };
  }
}
