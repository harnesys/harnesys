import { Inject, Injectable, Logger } from '@harnesys/brix';
import { AddonIncompatibleException } from '../../../domain/addons/errors.ts';
import { grantDigest } from '../../../domain/addons/permissions.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import { ContributionRegistryPort } from '../../../domain/addons/ports/contribution-registry.port.ts';
import { InstanceSupervisorPort } from '../../../domain/addons/ports/instance-supervisor.port.ts';
import type { OrgAddonRow } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { checkPackageCompatibility } from '../addon-platform.ts';
import { appendAudit, requireOrgAddon, requirePackage } from './org-addon.helpers.ts';

export interface RollbackAddonRequest {
  orgId: string;
  addonId: string;
  version: string;
  actor: { kind: 'user' | 'system' | 'host'; id: string };
}

@Injectable()
export class RollbackAddonUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly catalog: AddonPackageCatalogPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly registry: ContributionRegistryPort,
    private readonly supervisor: InstanceSupervisorPort,
    private readonly audit: AddonAuditPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-rollback');
  }

  async execute(request: RollbackAddonRequest): Promise<OrgAddonRow> {
    const row = requireOrgAddon(this.orgAddons, request.orgId, request.addonId);
    if (row.version === request.version) {
      return row;
    }
    const target = requirePackage(this.catalog, request.addonId, request.version);
    const compat = checkPackageCompatibility(target);
    if (compat.outcome === 'incompatible') {
      throw new AddonIncompatibleException(compat.reasons);
    }
    const wasRunning =
      (await this.supervisor.snapshot(request.orgId, request.addonId))?.state === 'running';
    await this.supervisor.stop(request.orgId, request.addonId, 'rollback');
    const oldOwner = { orgId: request.orgId, addonId: request.addonId, version: row.version };
    const newOwner = { orgId: request.orgId, addonId: request.addonId, version: target.version };
    try {
      this.registry.swap(oldOwner, newOwner, target.manifest);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.orgAddons.updateHealth(request.orgId, request.addonId, 'failed', message);
      throw error;
    }
    const updated: OrgAddonRow = {
      ...row,
      version: target.version,
      grantsDigest: grantDigest(target.manifest.permissions),
      health: 'stopped',
      lastError: null,
      updatedAt: new Date().toISOString(),
    };
    this.orgAddons.upsert(updated);
    if (wasRunning) {
      await this.supervisor.ensureRunning(request.orgId, request.addonId, 'rollback');
    }
    appendAudit(this.audit, request.orgId, request.actor, {
      action: 'addon.rollback',
      target: `${request.addonId}@${target.version}`,
      outcome: 'ok',
      details: { from: row.version, to: target.version },
    });
    this.logger.info(
      { orgId: request.orgId, addonId: request.addonId, to: target.version },
      'addon rolled back',
    );
    return updated;
  }
}
