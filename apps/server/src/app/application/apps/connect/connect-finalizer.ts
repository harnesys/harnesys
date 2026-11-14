import { Inject, Injectable, Logger } from '@harnesys/brix';
import { IdentityMismatchException, ProviderError } from '../../../domain/apps/errors.ts';
import { AccountEventPort } from '../../../domain/apps/ports/account-event.port.ts';
import { AccountRepositoryPort } from '../../../domain/apps/ports/account-repository.port.ts';
import { AppRepositoryPort } from '../../../domain/apps/ports/app-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { SecretScopePort } from '../../../domain/apps/ports/secret-scope.port.ts';
import type {
  AccountConnectResult,
  AccountKindModule,
  AppKindModule,
  AppSetupResult,
} from '../../../domain/apps/provider-module.ts';
import type { AccountRecord, AppRecord } from '../../../domain/apps/records.ts';
import { AccountAccessService } from '../access/account-access.service.ts';
import { resolveInputFields, valuesByFieldKeys } from '../shared/field-validation.ts';
import { isoNow } from '../shared/record-views.ts';
import { assertSecretShape, unionScopes } from '../shared/scope-coverage.ts';
import {
  ConnectFinalizePort,
  type FinalizeAccountInput,
  type FinalizeAppInput,
} from './connect-finalize.port.ts';

@Injectable()
export class ConnectFinalizer extends ConnectFinalizePort {
  private readonly logger: Logger;

  constructor(
    private readonly apps: AppRepositoryPort,
    private readonly accounts: AccountRepositoryPort,
    private readonly secrets: SecretScopePort,
    private readonly clock: ClockPort,
    private readonly events: AccountEventPort,
    private readonly access: AccountAccessService,
    @Inject(Logger) logger: Logger,
  ) {
    super();
    this.logger = logger.child('apps-connect');
  }

  override async finalizeApp(input: FinalizeAppInput): Promise<AppRecord> {
    assertSecretShape({
      allowed: input.module.secrets,
      fields: input.module.descriptor.fields,
      secrets: input.result.secrets,
    });
    const resolved = resolveAppResult(input.module, input.result);
    const metadata = input.module.validateMetadata(input.result.metadata);
    const id = input.appId;
    const now = this.clock.now();
    await this.secrets.write(
      input.orgId,
      { type: 'app', id },
      input.module.secrets,
      resolved.secretValues,
    );
    const record: AppRecord = {
      id,
      orgId: input.orgId,
      kind: input.module.descriptor.kind,
      label: input.result.label,
      status: 'configured',
      lastError: null,
      values: valuesByFieldKeys(input.module.descriptor.fields, resolved.values),
      secretFields: Object.keys(resolved.secretValues).sort(),
      metadata,
      verifiedAt: now,
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
    };
    this.apps.insert(record);
    this.events.publish({
      type: 'app.created',
      orgId: input.orgId,
      appId: record.id,
      accountId: null,
      kind: record.kind,
      status: null,
    });
    this.logger.info({ appId: record.id, kind: record.kind }, 'app created through connect');
    return record;
  }

  override async finalizeAccount(input: FinalizeAccountInput): Promise<AccountRecord> {
    if (input.module.descriptor.requiresApp.length > 0 && !input.app) {
      throw new ProviderError('invalid_response');
    }
    assertSecretShape({
      allowed: input.module.secrets,
      fields: input.module.descriptor.inputs,
      secrets: input.result.secrets,
      stored: input.existing?.secretFields,
    });
    if (input.module.descriptor.access.source === 'stored') {
      const stored = new Set(input.existing?.secretFields ?? []);
      const missing = input.module.descriptor.access.keys.filter(
        (key) => input.result.secrets[key] === undefined && !stored.has(key),
      );
      if (missing.length > 0) {
        throw new ProviderError('invalid_response');
      }
    }
    const metadata = input.module.validateMetadata(input.result.metadata);
    const partition = input.result.partition ?? '';
    const scopes = this.resultScopes(input.module, input.result.scopes);
    const byIdentity = this.accounts.findByIdentity(input.orgId, {
      kind: input.module.descriptor.kind,
      externalAccountId: input.result.externalAccountId,
      partition,
    });
    const target = this.resolveTarget(input.existing, byIdentity, input.result, partition);
    const id = target?.id ?? crypto.randomUUID();
    const now = this.clock.now();
    const config = {
      ...(target?.config ?? {}),
      ...valuesByFieldKeys(input.module.descriptor.inputs, input.inputs),
    };
    await this.secrets.write(
      input.orgId,
      { type: 'account', id },
      input.module.secrets,
      input.result.secrets,
    );
    const secretFields = [
      ...new Set([...(target?.secretFields ?? []), ...Object.keys(input.result.secrets)]),
    ].sort();
    if (target) {
      const updated = this.accounts.update(input.orgId, target.id, {
        appId: input.app?.id ?? target.appId,
        label: input.result.label,
        status: 'connected',
        lastError: null,
        scopes: unionScopes(target.scopes, scopes),
        expiresAt: input.result.expiresAt,
        config,
        secretFields,
        metadata,
        verifiedAt: now,
        updatedAt: isoNow(now),
      });
      this.complete(updated);
      return updated;
    }
    const record: AccountRecord = {
      id,
      orgId: input.orgId,
      appId: input.app?.id ?? null,
      kind: input.module.descriptor.kind,
      externalAccountId: input.result.externalAccountId,
      partition,
      label: input.result.label,
      status: 'connected',
      lastError: null,
      scopes,
      expiresAt: input.result.expiresAt,
      config,
      secretFields,
      metadata,
      verifiedAt: now,
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
    };
    this.accounts.insert(record);
    this.complete(record);
    return record;
  }

  private resolveTarget(
    existing: AccountRecord | null,
    byIdentity: AccountRecord | null,
    result: AccountConnectResult,
    partition: string,
  ): AccountRecord | null {
    if (existing) {
      if (
        existing.externalAccountId !== result.externalAccountId ||
        existing.partition !== partition
      ) {
        throw new IdentityMismatchException();
      }
      if (byIdentity && byIdentity.id !== existing.id) {
        throw new IdentityMismatchException();
      }
    }
    return existing ?? byIdentity;
  }

  private resultScopes(module: AccountKindModule, scopes: string[]): string[] {
    const known = module.descriptor.scopes.options.map((option) => option.key);
    const stray = scopes.filter((scope) => !known.includes(scope));
    if ((known.length === 0 && scopes.length > 0) || stray.length > 0) {
      throw new ProviderError('invalid_response');
    }
    return scopes;
  }

  private complete(record: AccountRecord): void {
    this.access.invalidate(record.id);
    this.events.publish({
      type: 'account.connected',
      orgId: record.orgId,
      appId: record.appId,
      accountId: record.id,
      kind: record.kind,
      status: 'connected',
    });
  }
}

function resolveAppResult(module: AppKindModule, result: AppSetupResult) {
  try {
    return resolveInputFields(module.descriptor.fields, {
      ...result.values,
      ...result.secrets,
    });
  } catch {
    throw new ProviderError('invalid_response');
  }
}
