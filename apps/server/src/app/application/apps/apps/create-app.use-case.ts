import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { FieldValue } from '../../../domain/apps/field.ts';
import { AccountEventPort } from '../../../domain/apps/ports/account-event.port.ts';
import { AppRepositoryPort } from '../../../domain/apps/ports/app-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';
import { PublicUrlsPort } from '../../../domain/apps/ports/public-urls.port.ts';
import { SecretScopePort } from '../../../domain/apps/ports/secret-scope.port.ts';
import type { AppView } from '../../../domain/apps/records.ts';
import { resolveInputFields, valuesByFieldKeys } from '../shared/field-validation.ts';
import { isoNow } from '../shared/record-views.ts';
import { buildAppView } from '../shared/view-builders.ts';
import { VerifyAppUseCase } from './verify-app.use-case.ts';

export interface CreateAppRequest {
  orgId: string;
  kind: string;
  label: string;
  values: Record<string, FieldValue>;
  secrets: Record<string, string>;
}

@Injectable()
export class CreateAppUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly apps: AppRepositoryPort,
    private readonly registry: ProviderRegistryPort,
    private readonly secrets: SecretScopePort,
    private readonly urls: PublicUrlsPort,
    private readonly clock: ClockPort,
    private readonly events: AccountEventPort,
    private readonly verifier: VerifyAppUseCase,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('apps-create');
  }

  async execute(request: CreateAppRequest): Promise<{ app: AppView }> {
    const module = this.registry.requireAppKind(request.kind);
    const resolved = resolveInputFields(module.descriptor.fields, {
      ...request.values,
      ...request.secrets,
    });
    const id = crypto.randomUUID();
    const now = this.clock.now();
    await this.secrets.write(
      request.orgId,
      { type: 'app', id },
      module.secrets,
      resolved.secretValues,
    );
    const record = {
      id,
      orgId: request.orgId,
      kind: module.descriptor.kind,
      label: request.label.trim(),
      status: 'configured' as const,
      lastError: null,
      values: valuesByFieldKeys(module.descriptor.fields, resolved.values),
      secretFields: Object.keys(resolved.secretValues).sort(),
      metadata: {},
      verifiedAt: null,
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
    };
    this.apps.insert(record);
    this.events.publish({
      type: 'app.created',
      orgId: record.orgId,
      appId: record.id,
      accountId: null,
      kind: record.kind,
      status: null,
    });
    this.logger.info({ appId: record.id, kind: record.kind }, 'app created');
    const verified = module.verify ? await this.verifier.verifyRecord(record) : record;
    return { app: buildAppView(verified, this.registry, this.urls) };
  }
}
