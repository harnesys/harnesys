import { Inject, Injectable, Logger } from '@harnesys/brix';
import { AddonException } from '../../../domain/addons/errors.ts';
import { type GrantEntry, grantDigest } from '../../../domain/addons/permissions.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import { GrantPolicyPort } from '../../../domain/addons/ports/grant-policy.port.ts';
import { InstanceSupervisorPort } from '../../../domain/addons/ports/instance-supervisor.port.ts';
import type { OrgAddonRow } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { EventBusPort } from '../../../domain/events/event-bus.port.ts';
import { appendAudit, requireOrgAddon, requirePackage } from './org-addon.helpers.ts';

export interface SetGrantsRequest {
  orgId: string;
  addonId: string;
  grants: readonly GrantEntry[];
  actor: { kind: 'user' | 'system' | 'host'; id: string };
}

@Injectable()
export class SetGrantsUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly catalog: AddonPackageCatalogPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly supervisor: InstanceSupervisorPort,
    readonly _policy: GrantPolicyPort,
    private readonly events: EventBusPort,
    private readonly audit: AddonAuditPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-set-grants');
  }

  async execute(request: SetGrantsRequest): Promise<OrgAddonRow> {
    const row = requireOrgAddon(this.orgAddons, request.orgId, request.addonId);
    const pkg = requirePackage(this.catalog, request.addonId, row.version);
    const declared = new Set(pkg.manifest.permissions.map((entry) => entry.id));
    const unknown = request.grants
      .filter((entry) => !declared.has(entry.id))
      .map((entry) => entry.id);
    if (unknown.length > 0) {
      throw new AddonException(
        'invalid_params',
        422,
        `Grants not declared by ${request.addonId}@${row.version}: ${unknown.join(', ')}`,
        { unknown },
      );
    }
    const digest = grantDigest(pkg.manifest.permissions);
    this.orgAddons.updateGrants(
      request.orgId,
      request.addonId,
      JSON.stringify(request.grants),
      digest,
    );
    const revokedMandatory = pkg.manifest.permissions
      .filter((entry) => !entry.optional)
      .filter((entry) => !request.grants.some((grant) => grant.id === entry.id));
    if (revokedMandatory.length > 0 && row.enabled) {
      await this.supervisor.stop(request.orgId, request.addonId, 'permission_revoked');
      this.orgAddons.updateHealth(request.orgId, request.addonId, 'stopped', 'permission_revoked');
    }
    this.events.publish(request.orgId, 'permissions.changed', {
      orgId: request.orgId,
      addonId: request.addonId,
      grants: request.grants,
      revoked: revokedMandatory.map((entry) => entry.id),
    });
    appendAudit(this.audit, request.orgId, request.actor, {
      action: 'addon.set_grants',
      target: `${request.addonId}@${row.version}`,
      outcome: 'ok',
      details: {
        granted: request.grants.map((entry) => entry.id),
        revoked: revokedMandatory.map((entry) => entry.id),
      },
    });
    this.logger.info(
      { orgId: request.orgId, addonId: request.addonId, grants: request.grants.length },
      'grants updated',
    );
    return { ...row, grantsJson: JSON.stringify(request.grants), grantsDigest: digest };
  }
}
