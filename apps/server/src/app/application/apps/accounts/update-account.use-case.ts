import { Injectable } from '@harnesys/brix';
import { AccountNotFoundException } from '../../../domain/apps/errors.ts';
import type { FieldValue } from '../../../domain/apps/field.ts';
import { AccountEventPort } from '../../../domain/apps/ports/account-event.port.ts';
import { AccountRepositoryPort } from '../../../domain/apps/ports/account-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';
import { PublicUrlsPort } from '../../../domain/apps/ports/public-urls.port.ts';
import type { AccountView } from '../../../domain/apps/records.ts';
import { resolveEditablePatch } from '../shared/field-validation.ts';
import { isoNow } from '../shared/record-views.ts';
import { buildAccountView } from '../shared/view-builders.ts';

export interface UpdateAccountRequest {
  orgId: string;
  accountId: string;
  label?: string;
  config?: Record<string, FieldValue>;
}

@Injectable()
export class UpdateAccountUseCase {
  constructor(
    private readonly accounts: AccountRepositoryPort,
    private readonly registry: ProviderRegistryPort,
    private readonly urls: PublicUrlsPort,
    private readonly clock: ClockPort,
    private readonly events: AccountEventPort,
  ) {}

  execute(request: UpdateAccountRequest): { account: AccountView } {
    const record = this.accounts.findById(request.orgId, request.accountId);
    if (!record) {
      throw new AccountNotFoundException(request.accountId);
    }
    const module = this.registry.accountKind(record.kind);
    if (!module) {
      throw new AccountNotFoundException(request.accountId);
    }
    const patch = request.config
      ? resolveEditablePatch(module.descriptor.inputs, request.config).values
      : {};
    const updated = this.accounts.update(request.orgId, record.id, {
      label: request.label?.trim() || record.label,
      config: { ...record.config, ...patch },
      updatedAt: isoNow(this.clock.now()),
    });
    this.events.publish({
      type: 'account.updated',
      orgId: updated.orgId,
      appId: updated.appId,
      accountId: updated.id,
      kind: updated.kind,
      status: updated.status,
    });
    return { account: buildAccountView(updated, this.registry, this.urls) };
  }
}
