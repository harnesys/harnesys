import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { AccountErrorCode } from '../../../domain/apps/errors.ts';
import {
  AccountAccessException,
  AccountNotFoundException,
  InsufficientScopesException,
  ProviderError,
} from '../../../domain/apps/errors.ts';
import { AccountEventPort } from '../../../domain/apps/ports/account-event.port.ts';
import { AccountRepositoryPort } from '../../../domain/apps/ports/account-repository.port.ts';
import { AppRepositoryPort } from '../../../domain/apps/ports/app-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { ProviderHttpFactoryPort } from '../../../domain/apps/ports/provider-http.port.ts';
import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';
import { SecretScopePort } from '../../../domain/apps/ports/secret-scope.port.ts';
import type {
  AccountKindModule,
  AppKindModule,
  Credentials,
  SecretReader,
} from '../../../domain/apps/provider-module.ts';
import type { AccountRecord, AppRecord } from '../../../domain/apps/records.ts';
import { createdProviderLogger } from '../shared/provider-context.ts';
import { isoNow } from '../shared/record-views.ts';
import { coversScopes, missingScopes, unionScopes } from '../shared/scope-coverage.ts';
import { statusForError } from './status-map.ts';

export interface AccessResult {
  credentials: Credentials;
  expiresAt: number | null;
}

interface CachedAccess {
  credentials: Credentials;
  expiresAt: number | null;
}

const RENEW_WINDOW_MS = 60_000;

@Injectable()
export class AccountAccessService {
  private readonly cache = new Map<string, CachedAccess>();
  private readonly inflight = new Map<string, Promise<CachedAccess>>();
  private readonly logger: Logger;

  constructor(
    private readonly accounts: AccountRepositoryPort,
    private readonly apps: AppRepositoryPort,
    private readonly registry: ProviderRegistryPort,
    private readonly secrets: SecretScopePort,
    private readonly http: ProviderHttpFactoryPort,
    private readonly clock: ClockPort,
    private readonly events: AccountEventPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('apps-access');
  }

  async access(
    orgId: string,
    accountId: string,
    opts?: { scopes?: string[] },
  ): Promise<AccessResult> {
    const account = this.requireAccount(orgId, accountId);
    const module = this.requireModule(account);
    const requested = opts?.scopes ?? [];
    if (!coversScopes(account.scopes, requested)) {
      throw new InsufficientScopesException(missingScopes(account.scopes, requested));
    }
    if (account.status === 'expired') {
      throw new AccountAccessException(account.lastError ?? 'expired');
    }
    const cached = this.cache.get(account.id);
    if (
      cached &&
      cached.expiresAt !== null &&
      cached.expiresAt - RENEW_WINDOW_MS > this.clock.now()
    ) {
      return { credentials: cached.credentials, expiresAt: cached.expiresAt };
    }
    const app = account.appId ? this.apps.findById(orgId, account.appId) : null;
    const target = { type: 'account' as const, id: account.id };
    const stored = this.secrets.reader(orgId, target, module.secrets);
    const appModule = app ? this.registry.appKind(app.kind) : null;
    const appSecrets =
      app && appModule
        ? this.secrets.reader(orgId, { type: 'app', id: app.id }, appModule.secrets)
        : null;
    try {
      const resolved = await this.resolveAccess({
        orgId,
        account,
        module,
        app,
        appModule,
        stored,
        appSecrets,
        requested,
      });
      this.cache.set(account.id, resolved);
      this.logger.info({ accountId: account.id, outcome: 'ok' }, 'account access resolved');
      return resolved;
    } catch (error) {
      const code = error instanceof ProviderError ? error.code : 'unknown';
      this.applyStatus(orgId, account, code);
      this.logger.info({ accountId: account.id, outcome: code }, 'account access failed');
      if (error instanceof ProviderError) {
        throw new AccountAccessException(code);
      }
      throw error;
    }
  }

  invalidate(accountId: string): void {
    this.cache.delete(accountId);
  }

  async report(orgId: string, accountId: string, code: AccountErrorCode): Promise<void> {
    const account = this.accounts.findById(orgId, accountId);
    this.invalidate(accountId);
    if (!account) {
      return;
    }
    this.applyStatus(orgId, account, code);
  }

  private async resolveAccess(input: {
    orgId: string;
    account: AccountRecord;
    module: AccountKindModule;
    app: AppRecord | null;
    appModule: AppKindModule | null;
    stored: SecretReader;
    appSecrets: SecretReader | null;
    requested: string[];
  }): Promise<CachedAccess> {
    const { account, module } = input;
    const source = module.descriptor.access.source;
    const needsResolve =
      source === 'derived' || (module.access !== undefined && this.isExpiring(account));
    if (!needsResolve) {
      return {
        credentials: await readCredentials(input.stored, module.descriptor.access.keys),
        expiresAt: account.expiresAt,
      };
    }
    if (!module.access) {
      throw new ProviderError('invalid_response');
    }
    const pending = this.inflight.get(account.id);
    if (pending) {
      return pending;
    }
    const task = this.runResolve(input).finally(() => {
      this.inflight.delete(account.id);
    });
    this.inflight.set(account.id, task);
    return task;
  }

  private async runResolve(input: {
    orgId: string;
    account: AccountRecord;
    module: AccountKindModule;
    app: AppRecord | null;
    appModule: AppKindModule | null;
    stored: SecretReader;
    appSecrets: SecretReader | null;
    requested: string[];
  }): Promise<CachedAccess> {
    const { account, module } = input;
    if (!module.access) {
      throw new ProviderError('invalid_response');
    }
    const appValues = input.app?.values ?? {};
    const userHostField = module.egress.userHost?.field;
    const userHostValue = userHostField
      ? (input.account.config[userHostField] ?? appValues[userHostField])
      : undefined;
    const grant = await module.access.resolve({
      http: this.http.create(
        module.egress,
        userHostValue === undefined ? null : String(userHostValue),
      ),
      now: () => this.clock.now(),
      log: createdProviderLogger(this.logger, []),
      account,
      app: input.app,
      appSecrets: input.appSecrets,
      stored: input.stored,
      reason: this.reasonOf(account),
      scopes: input.requested,
    });
    const expiresAt = grant.expiresAt;
    if (grant.persist) {
      assertPersistedSecrets(module, grant.persist.secrets);
      const persistedScopes = grant.persist.scopes;
      if (persistedScopes) {
        assertCatalogScopes(module, persistedScopes);
      }
      const scopes = persistedScopes
        ? unionScopes(account.scopes, persistedScopes)
        : account.scopes;
      await this.secrets.write(
        input.orgId,
        { type: 'account', id: account.id },
        module.secrets,
        grant.persist.secrets,
      );
      const secretFields = unionScopes(account.secretFields, Object.keys(grant.persist.secrets));
      this.accounts.update(input.orgId, account.id, {
        expiresAt,
        scopes,
        secretFields,
        updatedAt: isoNow(this.clock.now()),
      });
      this.events.publish({
        type: 'account.updated',
        orgId: input.orgId,
        appId: account.appId,
        accountId: account.id,
        kind: account.kind,
        status: account.status,
      });
    }
    return { credentials: grant.credentials, expiresAt };
  }

  private reasonOf(account: AccountRecord): 'missing' | 'expiring' | 'expired' {
    if (account.expiresAt === null) {
      return 'missing';
    }
    if (account.expiresAt <= this.clock.now()) {
      return 'expired';
    }
    return 'expiring';
  }

  private isExpiring(account: AccountRecord): boolean {
    return account.expiresAt !== null && account.expiresAt - RENEW_WINDOW_MS <= this.clock.now();
  }

  private requireAccount(orgId: string, accountId: string): AccountRecord {
    const account = this.accounts.findById(orgId, accountId);
    if (!account) {
      throw new AccountNotFoundException(accountId);
    }
    return account;
  }

  private requireModule(account: AccountRecord): AccountKindModule {
    const module = this.registry.accountKind(account.kind);
    if (!module) {
      throw new AccountAccessException('not_found');
    }
    return module;
  }

  private applyStatus(orgId: string, account: AccountRecord, code: AccountErrorCode): void {
    const status = statusForError(code);
    if (!status || status === account.status) {
      return;
    }
    this.accounts.update(orgId, account.id, {
      status,
      lastError: code,
      updatedAt: isoNow(this.clock.now()),
    });
    this.events.publish({
      type: 'account.status_changed',
      orgId,
      appId: account.appId,
      accountId: account.id,
      kind: account.kind,
      status,
    });
  }
}

async function readCredentials(
  reader: SecretReader,
  keys: readonly string[],
): Promise<Credentials> {
  const credentials: Credentials = {};
  for (const key of keys) {
    const value = await reader.get(key);
    if (value === null) {
      throw new ProviderError('invalid_credentials');
    }
    credentials[key] = value;
  }
  return credentials;
}

function assertPersistedSecrets(module: AccountKindModule, secrets: Record<string, string>): void {
  const allowed = new Set(module.secrets);
  if (Object.keys(secrets).some((key) => !allowed.has(key))) {
    throw new ProviderError('invalid_response');
  }
}

function assertCatalogScopes(module: AccountKindModule, scopes: string[]): void {
  const known = new Set(module.descriptor.scopes.options.map((option) => option.key));
  if (scopes.some((scope) => !known.has(scope))) {
    throw new ProviderError('invalid_response');
  }
}
