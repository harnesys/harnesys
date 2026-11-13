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
import { AddonNotifyPort } from '../../../domain/addons/ports/addon-notify.port.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import { ContributionRegistryPort } from '../../../domain/addons/ports/contribution-registry.port.ts';
import { InstanceSupervisorPort } from '../../../domain/addons/ports/instance-supervisor.port.ts';
import type { OrgAddonRow } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { EventBusPort } from '../../../domain/events/event-bus.port.ts';
import { AddonMigrationsPort } from '../addon-migrations.port.ts';
import { checkPackageCompatibility } from '../addon-platform.ts';
import { runAddonDataMigrations } from './addon-migrations.ts';
import { publishConsentRequired } from './consent-event.ts';
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
    private readonly events: EventBusPort,
    private readonly migrations: AddonMigrationsPort,
    private readonly notify: AddonNotifyPort,
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
      publishConsentRequired(this.events, {
        orgId: request.orgId,
        addonId: request.addonId,
        currentVersion: row.version,
        pendingVersion: request.version,
        addedPermissions: diff.added,
      });
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
      runAddonDataMigrations(
        { migrations: this.migrations, notify: this.notify, logger: this.logger },
        { orgId: request.orgId, pkg: next, fromVersion: row.version },
      );
    } catch (error) {
      this.rollbackPin(request, row, error);
      throw error;
    }
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
        await this.restorePreviousVersion(request, row, newOwner, oldOwner, error);
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

  /**
   * §4.6 atomicity: after the registry swap and pin update succeeded but the
   * restart failed, put the previous version back (contributions, pin) and
   * try to bring it up again.
   */
  private async restorePreviousVersion(
    request: UpdateAddonRequest,
    row: OrgAddonRow,
    newOwner: { orgId: string; addonId: string; version: string },
    oldOwner: { orgId: string; addonId: string; version: string },
    cause: unknown,
  ): Promise<void> {
    const message = cause instanceof Error ? cause.message : String(cause);
    const previous = this.catalog.find(request.addonId, row.version);
    if (previous) {
      try {
        this.registry.swap(newOwner, oldOwner, previous.manifest);
      } catch (swapError) {
        const swapMessage = swapError instanceof Error ? swapError.message : String(swapError);
        this.logger.error(
          { orgId: request.orgId, addonId: request.addonId, error: swapMessage },
          'registry swap back to the previous version failed',
        );
      }
    } else {
      this.logger.error(
        { orgId: request.orgId, addonId: request.addonId, version: row.version },
        'previous version cannot be restored: its package is no longer installed',
      );
    }
    this.orgAddons.upsert({
      ...row,
      health: 'failed',
      lastError: `update to ${request.version} failed, rolled back: ${message}`,
      updatedAt: new Date().toISOString(),
    });
    try {
      await this.supervisor.ensureRunning(request.orgId, request.addonId, 'update-rollback');
    } catch (restartError) {
      const restartMessage =
        restartError instanceof Error ? restartError.message : String(restartError);
      this.supervisor.mirrorHealth(request.orgId, request.addonId, 'failed', restartMessage);
      this.logger.error(
        { orgId: request.orgId, addonId: request.addonId, error: restartMessage },
        'restart of the previous version failed',
      );
    }
    this.logger.warn(
      { orgId: request.orgId, addonId: request.addonId, version: request.version, error: message },
      'addon update rolled back',
    );
  }

  /**
   * Consent baseline for the update: the currently pinned package declaration.
   * Built-in packages are scanned from the monorepo manifest, so after a
   * version bump the pinned declaration no longer resolves; the live grants
   * are then the only baseline left, and the diff flags exactly the
   * permissions the add-on does not hold yet.
   */
  private declarationOf(row: OrgAddonRow): readonly PermissionRequest[] {
    const pkg = this.catalog.find(row.addonId, row.version);
    if (pkg) {
      return pkg.manifest.permissions;
    }
    return grantsOfRow(row).map((grant) => ({
      id: grant.id,
      ...(grant.scope === undefined ? {} : { scope: grant.scope }),
      reason: 'granted before this update',
    }));
  }
}
