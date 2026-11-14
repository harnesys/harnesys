import { Inject, Injectable, Logger } from '@harnesys/brix';
import { Cron } from 'croner';
import { isoNow } from '../../application/apps/shared/record-views.ts';
import { requiredSecretKeys } from '../../application/apps/shared/scope-coverage.ts';
import { AccountRepositoryPort } from '../../domain/apps/ports/account-repository.port.ts';
import { AppRepositoryPort } from '../../domain/apps/ports/app-repository.port.ts';
import { ClockPort } from '../../domain/apps/ports/clock.port.ts';
import { ProviderRegistryPort } from '../../domain/apps/ports/provider-registry.port.ts';
import type { AccountRecord, AppRecord } from '../../domain/apps/records.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { listOrgIds } from './runtime.adapters.ts';

function collectOwners(
  apps: readonly AppRecord[],
  accounts: readonly AccountRecord[],
): Set<string> {
  const owners = new Set<string>();
  for (const app of apps) {
    for (const field of app.secretFields) {
      owners.add(`app:${app.id}:${field}`);
    }
  }
  for (const account of accounts) {
    for (const field of account.secretFields) {
      owners.add(`account:${account.id}:${field}`);
    }
  }
  return owners;
}

@Injectable()
export class AppsOrphanSweeper {
  private readonly job: Cron;
  private readonly logger: Logger;

  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly apps: AppRepositoryPort,
    private readonly accounts: AccountRepositoryPort,
    private readonly secrets: SecretStorePort,
    private readonly registry: ProviderRegistryPort,
    private readonly clock: ClockPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('apps-sweeper');
    this.job = new Cron('0 */6 * * *', () => {
      void this.sweepAll();
    });
    void this.sweepAll();
  }

  async sweepAll(): Promise<void> {
    for (const orgId of listOrgIds(this.layout)) {
      try {
        await this.sweepOrg(orgId);
      } catch (error) {
        this.logger.warn({ orgId }, 'apps sweep failed');
        void error;
      }
    }
  }

  async sweepOrg(orgId: string): Promise<void> {
    const apps = this.apps.list(orgId);
    const accounts = this.accounts.list(orgId);
    await this.sweepOrphanSecrets(orgId, collectOwners(apps, accounts));
    this.markMissingSecrets(orgId, accounts);
  }

  private async sweepOrphanSecrets(orgId: string, owners: Set<string>): Promise<void> {
    for (const key of await this.secrets.listKeys(orgId)) {
      if (!key.startsWith('app:') && !key.startsWith('account:')) {
        continue;
      }
      if (!owners.has(key)) {
        await this.secrets.delete(orgId, key);
        this.logger.info({ orgId }, 'removed orphan app secret');
      }
    }
  }

  private markMissingSecrets(orgId: string, accounts: readonly AccountRecord[]): void {
    for (const account of accounts) {
      const module = this.registry.accountKind(account.kind);
      if (!module) {
        this.logger.warn({ orgId, accountId: account.id }, 'account kind is not registered');
        continue;
      }
      const required = new Set(requiredSecretKeys(module.descriptor.inputs));
      if (module.descriptor.access.source === 'stored') {
        for (const key of module.descriptor.access.keys) {
          required.add(key);
        }
      }
      const missing = [...required].filter((key) => !account.secretFields.includes(key));
      if (missing.length === 0 || account.status !== 'connected') {
        continue;
      }
      this.accounts.update(orgId, account.id, {
        status: 'expired',
        lastError: 'invalid_credentials',
        updatedAt: isoNow(this.clock.now()),
      });
      this.logger.info({ orgId, accountId: account.id }, 'account is missing required secrets');
    }
  }

  stop(): void {
    this.job.stop();
  }
}
