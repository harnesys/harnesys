import { Injectable } from '@harnesys/brix';
import type { GithubAppStatusResponse, GithubContentsAccess } from '@harnesys/contracts';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { signGithubAppJwt } from '../../infra/integration/github/app-jwt.ts';
import { listAppInstallations } from '../../infra/integration/github/github-api.ts';
import { GithubAppStore } from '../../infra/integration/github/github-app-store.ts';

export interface GithubAppStatusInput {
  orgId: string;
}

const ACCESS_RANK: Record<GithubContentsAccess, number> = {
  none: 0,
  read: 1,
  write: 2,
};

@Injectable()
export class GithubAppStatusUseCase {
  constructor(
    private readonly appStore: GithubAppStore,
    private readonly registry: IntegrationRegistryPort,
  ) {}

  async execute(input: GithubAppStatusInput): Promise<GithubAppStatusResponse> {
    const app = await this.appStore.findVerified();
    return {
      configured: app !== null,
      appSlug: app && app.appSlug.trim() !== '' ? app.appSlug.trim() : null,
      contentsAccess: await this.contentsAccess(input.orgId),
    };
  }

  private async contentsAccess(orgId: string): Promise<GithubContentsAccess> {
    const installationIds = this.orgInstallationIds(orgId);
    if (installationIds.length === 0) {
      return 'write';
    }
    try {
      const app = await this.appStore.findVerified();
      if (!app) {
        return 'write';
      }
      const jwt = signGithubAppJwt({ appId: app.appId, privateKey: app.privateKey });
      const remote = await listAppInstallations(jwt);
      const granted = new Map(
        remote.map((installation) => [
          installation.installationId,
          installation.permissions.contents,
        ]),
      );
      let worst: GithubContentsAccess = 'write';
      for (const id of installationIds) {
        const value = normalizeAccess(granted.get(id));
        if (ACCESS_RANK[value] < ACCESS_RANK[worst]) {
          worst = value;
        }
      }
      return worst;
    } catch {
      return 'write';
    }
  }

  private orgInstallationIds(orgId: string): number[] {
    return this.registry
      .list(orgId)
      .filter((record) => record.provider === 'github' && record.status === 'connected')
      .map((record) => Number(record.providerJson?.installationId))
      .filter((id) => Number.isInteger(id) && id > 0);
  }
}

function normalizeAccess(value: string | undefined): GithubContentsAccess {
  if (value === 'write' || value === 'read') {
    return value;
  }
  return 'none';
}
