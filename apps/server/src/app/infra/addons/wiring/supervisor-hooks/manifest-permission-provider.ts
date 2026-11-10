import { Injectable } from '@harnesys/brix';
import type { EffectivePermission } from '@harnesys/sdk';
import {
  computeEffectivePermissions,
  type GrantEntry,
  type GrantRecord,
} from '../../../../domain/addons/permissions.ts';
import { AddonPackageCatalogPort } from '../../../../domain/addons/ports/addon-package-catalog.port.ts';
import { OrgAddonRepositoryPort } from '../../../../domain/addons/ports/org-addon-repository.port.ts';
import { PermissionDefinitionRegistry } from '../../dispatcher/permission-definitions.ts';
import type { SupervisorPermissionsProvider } from '../../supervisor/supervisor-deps.ts';

function parseGrants(grantsJson: string): GrantEntry[] {
  try {
    const parsed: unknown = JSON.parse(grantsJson);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is GrantEntry =>
        !!entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string',
    );
  } catch {
    return [];
  }
}

/**
 * Effective permissions for the `initialize` handshake: declaration ∩ grant ∩
 * host policy, plus baseline grants (§7.3). Experimental methods and
 * deprecations have no manifest source yet and stay empty.
 */
@Injectable()
export class ManifestPermissionProvider implements SupervisorPermissionsProvider {
  constructor(
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly catalog: AddonPackageCatalogPort,
    private readonly definitions: PermissionDefinitionRegistry,
  ) {}

  effectivePermissions(orgId: string, addonId: string): EffectivePermission[] {
    const row = this.orgAddons.find(orgId, addonId);
    const pkg = this.catalog.find(addonId, row?.version);
    if (!row || !pkg) {
      return [];
    }
    const grant: GrantRecord = {
      addonId,
      version: row.version,
      declaredDigest: row.grantsDigest,
      grants: parseGrants(row.grantsJson),
      grantedAt: row.updatedAt,
      grantedBy: 'admin',
    };
    return computeEffectivePermissions({
      declaration: pkg.manifest.permissions,
      grant,
      definitions: this.definitions.all(),
    });
  }

  experimentalMethods(_addonId: string): string[] {
    return [];
  }

  deprecations(_addonId: string): string[] {
    return [];
  }
}
