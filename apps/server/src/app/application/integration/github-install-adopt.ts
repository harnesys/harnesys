import type { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { signGithubAppJwt } from '../../infra/integration/github/app-jwt.ts';
import { listAppInstallations } from '../../infra/integration/github/github-api.ts';
import { GithubAppStore } from '../../infra/integration/github/github-app-store.ts';
import { upsertGithubIntegration } from './github-install-complete.ts';

export interface GithubInstallAdoptDeps {
  registry: IntegrationRegistryPort;
  appStore: GithubAppStore;
}

export type GithubInstallAdoptResult =
  | { status: 'ready'; integrationId: string }
  | { status: 'pending' };

export async function adoptSingleGithubInstallation(
  deps: GithubInstallAdoptDeps,
  orgId: string,
): Promise<GithubInstallAdoptResult> {
  try {
    const app = deps.appStore.require();
    const jwt = signGithubAppJwt({ appId: app.appId, privateKey: app.privateKey });
    const installations = await listAppInstallations(jwt);
    const installation = installations.length === 1 ? installations[0] : undefined;
    if (!installation?.accountLogin) {
      return { status: 'pending' };
    }
    const integration = upsertGithubIntegration(deps.registry, orgId, {
      accountLogin: installation.accountLogin,
      installationId: installation.installationId,
      appSlug: installation.appSlug ?? app.appSlug,
    });
    return { status: 'ready', integrationId: integration.id };
  } catch {
    return { status: 'pending' };
  }
}
