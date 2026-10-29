import { Injectable } from '@harnesys/brix';
import {
  buildGithubAppManifest,
  githubManifestUrl,
} from '../../infra/integration/github/github-manifest.ts';
import { GithubManifestSessionStore } from '../../infra/integration/github/github-manifest-sessions.ts';

export interface GithubManifestConnectPage {
  manifestJson: string;
  target: string;
}

@Injectable()
export class GithubManifestConnectUseCase {
  constructor(private readonly sessions: GithubManifestSessionStore) {}

  execute(ticket: string): GithubManifestConnectPage | null {
    const session = this.sessions.find(ticket);
    if (!session) {
      return null;
    }
    return {
      manifestJson: JSON.stringify(
        buildGithubAppManifest({ origin: session.origin, name: session.name }),
      ),
      target: githubManifestUrl(ticket),
    };
  }
}
