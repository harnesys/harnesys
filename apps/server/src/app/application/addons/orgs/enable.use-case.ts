import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { AddonManifest } from '@harnesys/sdk';
import { AddonException, AddonIncompatibleException } from '../../../domain/addons/errors.ts';
import {
  computeEffectivePermissions,
  type GrantEntry,
  type GrantRecord,
  grantDigest,
} from '../../../domain/addons/permissions.ts';
import { AddonNotifyPort } from '../../../domain/addons/ports/addon-notify.port.ts';
import type { InstalledAddonPackage } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import { ContributionRegistryPort } from '../../../domain/addons/ports/contribution-registry.port.ts';
import { GrantPolicyPort } from '../../../domain/addons/ports/grant-policy.port.ts';
import type { OrgAddonRow } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { EventBusPort } from '../../../domain/events/event-bus.port.ts';
import { AddonMigrationsPort } from '../addon-migrations.port.ts';
import { checkPackageCompatibility } from '../addon-platform.ts';
import { runAddonDataMigrations } from '../orgs/addon-migrations.ts';
import { appendAudit, requirePackage } from '../orgs/org-addon.helpers.ts';
import { publishConsentRequired } from './consent-event.ts';

export interface EnableAddonRequest {
  orgId: string;
  addonId: string;
  version?: string;
  grants: readonly GrantEntry[];
  actor: { kind: 'user' | 'system' | 'host'; id: string };
}

@Injectable()
export class EnableAddonUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly catalog: AddonPackageCatalogPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly registry: ContributionRegistryPort,
    private readonly policy: GrantPolicyPort,
    private readonly audit: AddonAuditPort,
    private readonly events: EventBusPort,
    private readonly migrations: AddonMigrationsPort,
    private readonly notify: AddonNotifyPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-enable');
  }

  execute(request: EnableAddonRequest): OrgAddonRow {
    const pkg = requirePackage(this.catalog, request.addonId, request.version);
    const compat = checkPackageCompatibility(pkg);
    if (compat.outcome === 'incompatible') {
      throw new AddonIncompatibleException(compat.reasons);
    }
    const existing = this.orgAddons.find(request.orgId, request.addonId);
    this.assertMandatoryGranted(
      request.orgId,
      request.addonId,
      pkg.manifest,
      request.grants,
      existing?.version ?? pkg.version,
    );
    if (existing?.enabled && existing.version === pkg.version) {
      return existing;
    }
    try {
      runAddonDataMigrations(
        { migrations: this.migrations, notify: this.notify, logger: this.logger },
        { orgId: request.orgId, pkg, fromVersion: existing?.version ?? null },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (existing) {
        this.orgAddons.updateHealth(request.orgId, request.addonId, 'failed', message);
      }
      throw error;
    }
    const now = new Date().toISOString();
    const grantsDigest = grantDigest(pkg.manifest.permissions);
    const grantsJson = JSON.stringify(request.grants);
    const row: OrgAddonRow = {
      orgId: request.orgId,
      addonId: request.addonId,
      version: pkg.version,
      enabled: true,
      grantsJson,
      grantsDigest,
      configJson: existing?.configJson ?? '{}',
      health: 'stopped',
      lastError: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.orgAddons.upsert(row);
    this.registry.activate(
      { orgId: request.orgId, addonId: request.addonId, version: pkg.version },
      pkg.manifest,
    );
    const effective = computeEffectivePermissions({
      declaration: pkg.manifest.permissions,
      grant: this.grantRecord(pkg, request, grantsDigest),
      hostPolicy: this.policy.read(),
    });
    appendAudit(this.audit, request.orgId, request.actor, {
      action: 'addon.enable',
      target: `${request.addonId}@${pkg.version}`,
      outcome: 'ok',
      details: { effective: effective.length, warnings: compat.skipped.length },
    });
    this.logger.info(
      { orgId: request.orgId, addonId: request.addonId, version: pkg.version },
      'addon enabled',
    );
    return row;
  }

  private assertMandatoryGranted(
    orgId: string,
    addonId: string,
    manifest: AddonManifest,
    grants: readonly GrantEntry[],
    currentVersion: string,
  ): void {
    const grantedIds = new Set(grants.map((entry) => entry.id));
    const missing = manifest.permissions
      .filter((entry) => !entry.optional && !grantedIds.has(entry.id))
      .map((entry) => entry.id);
    if (missing.length > 0) {
      publishConsentRequired(this.events, {
        orgId,
        addonId,
        currentVersion,
        pendingVersion: manifest.version,
        addedPermissions: manifest.permissions.filter(
          (entry) => !entry.optional && !grantedIds.has(entry.id),
        ),
      });
      throw new AddonException(
        'needs_consent',
        409,
        `Mandatory permissions must be granted on enable: ${missing.join(', ')}`,
        { missing },
      );
    }
  }

  private grantRecord(
    pkg: InstalledAddonPackage,
    request: EnableAddonRequest,
    grantsDigest: string,
  ): GrantRecord {
    const grants: GrantEntry[] = [...request.grants];
    return {
      addonId: pkg.id,
      version: pkg.version,
      declaredDigest: grantsDigest,
      grants,
      grantedAt: new Date().toISOString(),
      grantedBy: request.actor.id,
    };
  }
}
