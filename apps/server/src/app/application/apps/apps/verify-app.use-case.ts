import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { AccountErrorCode } from '../../../domain/apps/errors.ts';
import { AppNotFoundException, ProviderError } from '../../../domain/apps/errors.ts';
import { MtprotoLoginPort } from '../../../domain/apps/mtproto-port.ts';
import { AccountEventPort } from '../../../domain/apps/ports/account-event.port.ts';
import { AppRepositoryPort } from '../../../domain/apps/ports/app-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { ProviderHttpFactoryPort } from '../../../domain/apps/ports/provider-http.port.ts';
import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';
import { PublicUrlsPort } from '../../../domain/apps/ports/public-urls.port.ts';
import { SecretScopePort } from '../../../domain/apps/ports/secret-scope.port.ts';
import type { AppKindModule } from '../../../domain/apps/provider-module.ts';
import type { AppRecord, AppView } from '../../../domain/apps/records.ts';
import { createdProviderLogger } from '../shared/provider-context.ts';
import { isoNow } from '../shared/record-views.ts';
import { buildAppView } from '../shared/view-builders.ts';

export interface VerifyAppRequest {
  orgId: string;
  appId: string;
}

@Injectable()
export class VerifyAppUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly apps: AppRepositoryPort,
    private readonly registry: ProviderRegistryPort,
    private readonly secrets: SecretScopePort,
    private readonly http: ProviderHttpFactoryPort,
    private readonly urls: PublicUrlsPort,
    private readonly clock: ClockPort,
    private readonly events: AccountEventPort,
    private readonly mtproto: MtprotoLoginPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('apps-verify');
  }

  async execute(request: VerifyAppRequest): Promise<{ app: AppView }> {
    const record = this.requireApp(request.orgId, request.appId);
    const updated = await this.verifyRecord(record);
    return { app: buildAppView(updated, this.registry, this.urls) };
  }

  async verifyRecord(record: AppRecord): Promise<AppRecord> {
    const module = this.registry.appKind(record.kind);
    if (!module) {
      return this.markInvalid(record, 'not_found');
    }
    if (!module.verify) {
      return this.apps.update(record.orgId, record.id, {
        status: 'configured',
        lastError: null,
        verifiedAt: this.clock.now(),
        updatedAt: isoNow(this.clock.now()),
      });
    }
    const reader = this.secrets.reader(
      record.orgId,
      { type: 'app', id: record.id },
      module.secrets,
    );
    const userHostField = module.egress.userHost?.field;
    const userHostValue = userHostField ? record.values[userHostField] : undefined;
    try {
      await module.verify({
        http: this.http.create(
          module.egress,
          userHostValue === undefined ? null : String(userHostValue),
        ),
        now: () => this.clock.now(),
        log: createdProviderLogger(this.logger, []),
        mtproto: this.mtproto,
        app: record,
        secrets: reader,
      });
      const updated = this.apps.update(record.orgId, record.id, {
        status: 'configured',
        lastError: null,
        verifiedAt: this.clock.now(),
        updatedAt: isoNow(this.clock.now()),
      });
      this.publish(updated);
      return updated;
    } catch (error) {
      const code = error instanceof ProviderError ? error.code : 'unknown';
      this.logger.warn({ appId: record.id, outcome: code }, 'app verification failed');
      return this.markInvalid(record, code);
    }
  }

  private markInvalid(record: AppRecord, code: AccountErrorCode | null): AppRecord {
    const updated = this.apps.update(record.orgId, record.id, {
      status: 'invalid',
      lastError: code,
      updatedAt: isoNow(this.clock.now()),
    });
    this.publish(updated);
    return updated;
  }

  private publish(record: AppRecord): void {
    this.events.publish({
      type: 'app.updated',
      orgId: record.orgId,
      appId: record.id,
      accountId: null,
      kind: record.kind,
      status: null,
    });
  }

  private requireApp(orgId: string, appId: string): AppRecord {
    const record = this.apps.findById(orgId, appId);
    if (!record) {
      throw new AppNotFoundException(appId);
    }
    return record;
  }
}

export type { AppKindModule };
