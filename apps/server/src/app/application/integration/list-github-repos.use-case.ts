import { Injectable } from '@harnesys/brix';
import type { GithubReposResponse } from '@harnesys/contracts';
import { IntegrationTokenPort } from '../../domain/integration/integration-token.port.ts';
import { listInstallationRepos } from '../../infra/integration/github/github-content-api.ts';

export interface ListGithubReposInput {
  orgId: string;
  integrationId: string;
}

@Injectable()
export class ListGithubReposUseCase {
  constructor(private readonly tokens: IntegrationTokenPort) {}

  async execute(input: ListGithubReposInput): Promise<GithubReposResponse> {
    const token = await this.tokens.getAccessToken(input.orgId, input.integrationId);
    return { repos: await listInstallationRepos(token) };
  }
}
