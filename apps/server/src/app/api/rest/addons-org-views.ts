import type {
  AddonCompatibilityView,
  AddonConnectionView,
  AddonGrantDiffView,
  AddonPermissionView,
  OrgAddonDetail,
  OrgAddonSummary,
} from '@harnesys/contracts';
import type { PermissionRequest } from '@harnesys/sdk';
import { checkPackageCompatibility } from '../../application/addons/addon-platform.ts';
import type { CompatibilityResult } from '../../domain/addons/compatibility.ts';
import { type GrantEntry, grantDiff } from '../../domain/addons/permissions.ts';
import type { InstalledAddonPackage } from '../../domain/addons/ports/addon-package-catalog.port.ts';
import type { AddonBindingRow } from '../../domain/addons/ports/binding-repository.port.ts';
import type { OrgAddonRow } from '../../domain/addons/ports/org-addon-repository.port.ts';
import type { PermissionDefinitionsPort } from '../../domain/addons/ports/permission-definitions.port.ts';

export interface AddonViewDeps {
  readonly definitions: PermissionDefinitionsPort;
}

export function manifestSummaryOf(pkg: InstalledAddonPackage) {
  return {
    platform: pkg.manifest.platform,
    activation: pkg.manifest.activation,
    runtimeProfile: pkg.manifest.runtime.profile,
    ...(pkg.manifest.homepage === undefined ? {} : { homepage: pkg.manifest.homepage }),
    ...(pkg.manifest.license === undefined ? {} : { license: pkg.manifest.license }),
    features: pkg.manifest.features ?? [],
  };
}

export function compatibilityViewOf(pkg: InstalledAddonPackage): AddonCompatibilityView {
  const compat: CompatibilityResult = checkPackageCompatibility(pkg);
  return {
    outcome: compat.outcome === 'ok' ? 'ok' : 'incompatible',
    reasons: compat.reasons,
    skipped: compat.skipped.map((skip) => ({ ...skip })),
  };
}

export function latestVersionOf(
  catalog: { listInstalled(): InstalledAddonPackage[] },
  addonId: string,
): string | null {
  const versions = catalog
    .listInstalled()
    .filter((pkg) => pkg.id === addonId)
    .map((pkg) => pkg.version)
    .sort();
  return versions.at(-1) ?? null;
}

function permissionViewOf(
  deps: AddonViewDeps,
  declared: PermissionRequest,
  granted: boolean,
): AddonPermissionView {
  const definition = deps.definitions.get(declared.id);
  return {
    id: declared.id,
    risk: definition?.risk ?? 'low',
    scope: declared.scope,
    reason: declared.reason,
    optional: declared.optional ?? false,
    baseline: definition?.baseline ?? false,
    granted,
  };
}

export function declaredPermissionsOf(
  deps: AddonViewDeps,
  pkg: InstalledAddonPackage,
  grants: readonly GrantEntry[],
): AddonPermissionView[] {
  const grantedIds = new Set(grants.map((entry) => entry.id));
  return pkg.manifest.permissions.map((declared) =>
    permissionViewOf(deps, declared, grantedIds.has(declared.id)),
  );
}

export function grantDiffViewOf(
  deps: AddonViewDeps,
  installed: InstalledAddonPackage | undefined,
  latest: InstalledAddonPackage | undefined,
): AddonGrantDiffView {
  if (!installed || !latest || installed.version === latest.version) {
    return { added: [], removed: [] };
  }
  const diff = grantDiff(installed.manifest.permissions, latest.manifest.permissions);
  return {
    added: diff.added.map((entry) =>
      permissionViewOf(
        deps,
        {
          id: entry.id,
          ...(entry.scope === undefined ? {} : { scope: entry.scope }),
          reason: entry.reason ?? '',
        },
        false,
      ),
    ),
    removed: diff.removed.map((entry) => entry.id),
  };
}

export function connectionsViewOf(
  pkg: InstalledAddonPackage,
  bindings: readonly AddonBindingRow[],
): AddonConnectionView[] {
  return pkg.manifest.connections.map((connection) => {
    const accountIds = bindings
      .filter((row) => row.connectionId === connection.id)
      .map((row) => row.accountId);
    return {
      connectionId: connection.id,
      label:
        typeof connection.label === 'string'
          ? connection.label
          : (connection.label.en ?? connection.id),
      accountKinds: connection.accountKinds,
      cardinality: connection.cardinality,
      optional: connection.optional ?? false,
      accountIds,
      needsSetup: accountIds.length === 0,
    };
  });
}

export function orgAddonSummaryOf(
  _deps: AddonViewDeps,
  row: OrgAddonRow,
  pkg: InstalledAddonPackage | undefined,
  latestVersion: string | null,
): OrgAddonSummary {
  if (!pkg) {
    return {
      orgId: row.orgId,
      addonId: row.addonId,
      version: row.version,
      title: row.addonId,
      description: '',
      enabled: row.enabled,
      health: row.health,
      lastError: row.lastError,
      compatibility: { outcome: 'incompatible', reasons: ['package_missing'], skipped: [] },
      updateAvailable: latestVersion,
      warnings: ['Package is missing from the catalog'],
    };
  }
  const compat = compatibilityViewOf(pkg);
  const warnings = compat.outcome === 'ok' ? [] : compat.reasons;
  return {
    orgId: row.orgId,
    addonId: row.addonId,
    version: row.version,
    title: l10nTitle(pkg),
    description: l10nDescription(pkg),
    ...(pkg.manifest.icon === undefined ? {} : { icon: pkg.manifest.icon }),
    enabled: row.enabled,
    health: row.health,
    lastError: row.lastError,
    compatibility: compat,
    updateAvailable: latestVersion !== null && latestVersion !== row.version ? latestVersion : null,
    warnings,
  };
}

export interface AddonDetailInput {
  deps: AddonViewDeps;
  row: OrgAddonRow;
  pkg: InstalledAddonPackage | undefined;
  latest: InstalledAddonPackage | undefined;
  bindings: readonly AddonBindingRow[];
  configValues: Record<string, unknown>;
}

/** Detail for a package installed on the host but not yet enabled in the org. */
export function orgAvailableDetailOf(input: {
  deps: AddonViewDeps;
  orgId: string;
  pkg: InstalledAddonPackage;
}): OrgAddonDetail {
  const { deps, orgId, pkg } = input;
  const compat = compatibilityViewOf(pkg);
  return {
    orgId,
    addonId: pkg.id,
    version: pkg.version,
    title: l10nTitle(pkg),
    description: l10nDescription(pkg),
    ...(pkg.manifest.icon === undefined ? {} : { icon: pkg.manifest.icon }),
    enabled: false,
    health: 'stopped',
    lastError: null,
    compatibility: compat,
    updateAvailable: null,
    warnings: compat.outcome === 'ok' ? [] : compat.reasons,
    manifest: manifestSummaryOf(pkg),
    contributions: pkg.manifest.contributions.map((contribution) => ({
      id: contribution.id,
      family: contribution.family,
      optional: contribution.optional ?? false,
    })),
    permissions: {
      declared: declaredPermissionsOf(deps, pkg, []),
      granted: [],
      diff: { added: [], removed: [] },
    },
    connections: [],
    configValues: {},
  };
}

export function orgAddonDetailOf(input: AddonDetailInput): OrgAddonDetail {
  const { deps, row, pkg, latest, bindings, configValues } = input;
  const grants = parseGrants(row.grantsJson);
  const summary = orgAddonSummaryOf(deps, row, pkg, latest?.version ?? null);
  if (!pkg) {
    return {
      ...summary,
      manifest: {
        platform: 1,
        activation: 'lazy',
        runtimeProfile: 'trusted',
        features: [],
      },
      contributions: [],
      permissions: { declared: [], granted: grants, diff: { added: [], removed: [] } },
      connections: [],
      configValues,
    };
  }
  return {
    ...summary,
    manifest: manifestSummaryOf(pkg),
    contributions: pkg.manifest.contributions.map((contribution) => ({
      id: contribution.id,
      family: contribution.family,
      optional: contribution.optional ?? false,
    })),
    permissions: {
      declared: declaredPermissionsOf(deps, pkg, grants),
      granted: grants,
      diff: grantDiffViewOf(deps, pkg, latest),
    },
    connections: connectionsViewOf(pkg, bindings),
    configValues,
  };
}

export function parseGrants(grantsJson: string): GrantEntry[] {
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

function l10nTitle(pkg: InstalledAddonPackage): string {
  const title = pkg.manifest.title;
  return typeof title === 'string' ? title : (title.en ?? pkg.manifest.id);
}

function l10nDescription(pkg: InstalledAddonPackage): string {
  const description = pkg.manifest.description;
  return typeof description === 'string' ? description : (description.en ?? '');
}
