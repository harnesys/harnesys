import type { Logger } from '@harnesys/brix';
import { ProviderError } from '../../../domain/apps/errors.ts';
import { AccountRepositoryPort } from '../../../domain/apps/ports/account-repository.port.ts';
import { AppRepositoryPort } from '../../../domain/apps/ports/app-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { ProviderHttpFactoryPort } from '../../../domain/apps/ports/provider-http.port.ts';
import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';
import { SecretScopePort } from '../../../domain/apps/ports/secret-scope.port.ts';
import type { AccountKindModule, AppKindModule } from '../../../domain/apps/provider-module.ts';
import type { AccountRecord, AppRecord } from '../../../domain/apps/records.ts';
import { withTimeout } from './concurrency.ts';
import { createdProviderLogger } from './provider-context.ts';

const REVOKE_TIMEOUT_MS = 5_000;

export interface RevokeDeps {
  accounts: AccountRepositoryPort;
  apps: AppRepositoryPort;
  registry: ProviderRegistryPort;
  secrets: SecretScopePort;
  http: ProviderHttpFactoryPort;
  clock: ClockPort;
  logger: Logger;
}

export async function revokeAccountBestEffort(
  deps: RevokeDeps,
  orgId: string,
  account: AccountRecord,
): Promise<void> {
  const module = deps.registry.accountKind(account.kind);
  if (!module?.revoke) {
    return;
  }
  const app = account.appId ? deps.apps.findById(orgId, account.appId) : null;
  const appModule = app ? deps.registry.appKind(app.kind) : null;
  try {
    await withTimeout(
      module.revoke(buildRevokeCtx(deps, { orgId, account, app, appModule, module })),
      REVOKE_TIMEOUT_MS,
    );
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : 'unknown';
    deps.logger.warn({ accountId: account.id, outcome: code }, 'account revoke failed');
  }
}

function buildRevokeCtx(
  deps: RevokeDeps,
  input: {
    orgId: string;
    account: AccountRecord;
    app: AppRecord | null;
    appModule: AppKindModule | null;
    module: AccountKindModule;
  },
) {
  const { orgId, account, app, appModule, module } = input;
  const userHostField = module.egress.userHost?.field;
  const userHostValue = userHostField
    ? (account.config[userHostField] ?? app?.values[userHostField])
    : undefined;
  return {
    http: deps.http.create(
      module.egress,
      userHostValue === undefined ? null : String(userHostValue),
    ),
    now: () => deps.clock.now(),
    log: createdProviderLogger(deps.logger, []),
    account,
    app,
    appSecrets:
      app && appModule
        ? deps.secrets.reader(orgId, { type: 'app', id: app.id }, appModule.secrets)
        : null,
    stored: deps.secrets.reader(orgId, { type: 'account', id: account.id }, module.secrets),
  };
}
