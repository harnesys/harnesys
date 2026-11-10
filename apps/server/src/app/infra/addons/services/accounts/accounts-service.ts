import { Injectable } from '@harnesys/brix';
import { AddonError } from '@harnesys/sdk';
import { AccountsFacadePort } from '../../../../application/apps/accounts-facade.port.ts';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import { OrgAudit } from '../../../../domain/fleet/org-audit.port.ts';
import { isAccountErrorCode, resolveBoundAccountId } from '../account-binding.ts';
import { serviceMethod } from '../method.ts';
import { BindingsReader } from '../sinks.ts';

@Injectable()
export class AccountsHostService implements HostServiceModule {
  readonly namespace = 'accounts';
  readonly methods: readonly HostMethodSpec[];

  constructor(
    private readonly accounts: AccountsFacadePort,
    private readonly bindings: BindingsReader,
    private readonly audit: OrgAudit,
  ) {
    this.methods = [
      serviceMethod('accounts.list', undefined, (ctx, params) => this.list(ctx, params.connection)),
      serviceMethod('accounts.report', undefined, (ctx, params) => this.report(ctx, params)),
      serviceMethod('accounts.access', undefined, (ctx, params) => this.access(ctx, params)),
    ];
  }

  private async list(
    ctx: HostCallContext,
    connection: string,
  ): Promise<{
    accounts: Array<{
      accountId: string;
      label: string;
      externalAccountId: string;
      status: string;
    }>;
  }> {
    const rows = this.bindings.accountsFor(ctx.orgId, ctx.addonId, connection);
    const accounts = [];
    for (const row of rows) {
      const view = await this.accounts.get(ctx.orgId, row.accountId);
      if (!view) {
        continue;
      }
      accounts.push({
        accountId: view.id,
        label: view.label,
        externalAccountId: view.externalAccountId,
        status: view.status,
      });
    }
    return { accounts };
  }

  private async report(
    ctx: HostCallContext,
    params: { connection: string; accountId?: string; code: string },
  ): Promise<Record<string, never>> {
    if (!isAccountErrorCode(params.code)) {
      throw new AddonError('invalid_params', {
        detail: `unknown account error code: ${params.code}`,
      });
    }
    const accountId = resolveBoundAccountId(
      this.bindings.accountsFor(ctx.orgId, ctx.addonId, params.connection),
      params.accountId,
    );
    await this.accounts.report(ctx.orgId, accountId, params.code);
    return {};
  }

  private async access(
    ctx: HostCallContext,
    params: { connection: string; accountId?: string },
  ): Promise<{ credentials: unknown; expiresAt?: string }> {
    const rows = this.bindings.accountsFor(ctx.orgId, ctx.addonId, params.connection);
    const accountId = resolveBoundAccountId(rows, params.accountId);
    const { credentials, expiresAt } = await this.accounts.access(ctx.orgId, accountId);
    this.audit.append(ctx.orgId, {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actorKind: 'system',
      actorId: `addon:${ctx.addonId}`,
      viaNodeId: null,
      action: 'addon.accounts_access',
      resource: `${params.connection}/${accountId}`,
      result: 'ok',
    });
    return {
      credentials,
      ...(expiresAt !== null && expiresAt !== undefined
        ? { expiresAt: new Date(expiresAt).toISOString() }
        : {}),
    };
  }
}
