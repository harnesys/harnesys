import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { PermissionRequest } from '@harnesys/sdk';
import {
  AddonIncompatibleException,
  AddonNeedsConsentException,
} from '../../../domain/addons/errors.ts';
import {
  type GrantEntry,
  grantDiff,
  grantDigest,
  needsConsent,
} from '../../../domain/addons/permissions.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import { ContributionRegistryPort } from '../../../domain/addons/ports/contribution-registry.port.ts';
import { InstanceSupervisorPort } from '../../../domain/addons/ports/instance-supervisor.port.ts';
import type { OrgAddonRow } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { checkPackageCompatibility } from '../addon-platform.ts';
import { appendAudit, grantsOfRow, requireOrgAddon, requirePackage } from './org-addon.helpers.ts';

export interface UpdateAddonRequest {
  orgId: string;
  addonId: string;
  version: string;
  grants?: readonly GrantEntry[];
  actor: { kind: 'user' | 'system' | 'host'; id: string };
}

@Injectable()
export class UpdateAddonUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly catalog: AddonPackageCatalogPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly registry: ContributionRegistryPort,
    private readonly supervisor: InstanceSupervisorPort,
    private readonly audit: AddonAuditPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-update');
  }

  async execute(request: UpdateAddonRequest): Promise<OrgAddonRow> {
    const row = requireOrgAddon(this.orgAddons, request.orgId, request.addonId);
    if (row.version === request.version) {
      return row;
    }
    const next = requirePackage(this.catalog, request.addonId, request.version);
    const compat = checkPackageCompatibility(next);
    if (compat.outcome === 'incompatible') {
      throw new AddonIncompatibleException(compat.reasons);
    }
    const diff = grantDiff(this.declarationOf(row), next.manifest.permissions);
    if (needsConsent(diff) && !request.grants) {
      throw new AddonNeedsConsentException(
        request.version,
        diff.added.map((entry) => entry.id),
      );
    }
    const wasRunning =
      (await this.supervisor.snapshot(request.orgId, request.addonId))?.state === 'running';
    await this.supervisor.stop(request.orgId, request.addonId, 'update');
    const oldOwner = { orgId: request.orgId, addonId: request.addonId, version: row.version };
    const newOwner = { orgId: request.orgId, addonId: request.addonId, version: next.version };
    try {
      this.registry.swap(oldOwner, newOwner, next.manifest);
    } catch (error) {
      this.rollbackPin(request, row, error);
      throw error;
    }
    const grants = request.grants ? [...request.grants] : grantsOfRow(row);
    const updated: OrgAddonRow = {
      ...row,
      version: next.version,
      grantsJson: JSON.stringify(grants),
      grantsDigest: grantDigest(next.manifest.permissions),
      health: 'stopped',
      lastError: null,
      updatedAt: new Date().toISOString(),
    };
    this.orgAddons.upsert(updated);
    if (wasRunning) {
      try {
        await this.supervisor.ensureRunning(request.orgId, request.addonId, 'update');
      } catch (error) {
        this.rollbackPin(request, row, error);
        throw error;
      }
    }
    appendAudit(this.audit, request.orgId, request.actor, {
      action: 'addon.update',
      target: `${request.addonId}@${next.version}`,
      outcome: 'ok',
      details: { from: row.version, addedPermissions: diff.added.map((entry) => entry.id) },
    });
    this.logger.info(
      { orgId: request.orgId, addonId: request.addonId, from: row.version, to: next.version },
      'addon updated',
    );
    return updated;
  }

  private rollbackPin(request: UpdateAddonRequest, row: OrgAddonRow, cause: unknown): void {
    const message = cause instanceof Error ? cause.message : String(cause);
    this.orgAddons.upsert({
      ...row,
      health: 'failed',
      lastError: `update to ${request.version} failed, rolled back: ${message}`,
      updatedAt: new Date().toISOString(),
    });
    this.logger.warn(
      { orgId: request.orgId, addonId: request.addonId, version: request.version, error: message },
      'addon update rolled back',
    );
  }

  private declarationOf(row: OrgAddonRow): readonly PermissionRequest[] {
    return requirePackage(this.catalog, row.addonId, row.version).manifest.permissions;
  }
}
