import { Inject, Injectable, Logger } from '@harnesys/brix';
import { AddonException } from '../../../domain/addons/errors.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import { BindingRepositoryPort } from '../../../domain/addons/ports/binding-repository.port.ts';
import type { OrgAddonRow } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { AccountsFacadePort } from '../../apps/accounts-facade.port.ts';
import { appendAudit, requireOrgAddon, requirePackage } from './org-addon.helpers.ts';

export interface SetBindingsRequest {
  orgId: string;
  addonId: string;
  connectionId: string;
  accountIds: readonly string[];
  actor: { kind: 'user' | 'system' | 'host'; id: string };
}

@Injectable()
export class SetBindingsUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly catalog: AddonPackageCatalogPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly bindings: BindingRepositoryPort,
    private readonly accounts: AccountsFacadePort,
    private readonly audit: AddonAuditPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-set-bindings');
  }

  async execute(request: SetBindingsRequest): Promise<OrgAddonRow> {
    const row = requireOrgAddon(this.orgAddons, request.orgId, request.addonId);
    const pkg = requirePackage(this.catalog, request.addonId, row.version);
    const connection = pkg.manifest.connections.find((entry) => entry.id === request.connectionId);
    if (!connection) {
      throw new AddonException(
        'not_found',
        404,
        `Connection is not declared by the addon: ${request.connectionId}`,
      );
    }
    if (connection.cardinality === 'one' && request.accountIds.length > 1) {
      throw new AddonException(
        'conflict',
        409,
        `Connection ${request.connectionId} binds one account, got ${request.accountIds.length}`,
      );
    }
    for (const accountId of request.accountIds) {
      await this.assertAccountBindable(request, connection, accountId);
    }
    this.bindings.setBindings(
      request.orgId,
      request.addonId,
      request.connectionId,
      request.accountIds,
    );
    appendAudit(this.audit, request.orgId, request.actor, {
      action: 'addon.set_bindings',
      target: `${request.addonId}/${request.connectionId}`,
      outcome: 'ok',
      details: { accounts: [...request.accountIds] },
    });
    this.logger.info(
      {
        orgId: request.orgId,
        addonId: request.addonId,
        connectionId: request.connectionId,
        accounts: request.accountIds.length,
      },
      'bindings updated',
    );
    return row;
  }

  private async assertAccountBindable(
    request: SetBindingsRequest,
    connection: { accountKinds: string[]; scopes?: string[] },
    accountId: string,
  ): Promise<void> {
    const account = await this.accounts.get(request.orgId, accountId);
    if (!account) {
      throw new AddonException(
        'not_found',
        404,
        `Account does not belong to the organization: ${accountId}`,
      );
    }
    if (!connection.accountKinds.includes(account.kind)) {
      throw new AddonException(
        'invalid_params',
        422,
        `Account kind ${account.kind} does not fit connection ${request.connectionId}`,
        { connectionId: request.connectionId, accountKind: account.kind },
      );
    }
    const missing = (connection.scopes ?? []).filter((scope) => !account.scopes.includes(scope));
    if (missing.length > 0) {
      throw new AddonException(
        'permission_denied',
        403,
        `Account ${accountId} lacks scopes required by connection ${request.connectionId}`,
        { missing },
      );
    }
  }
}
