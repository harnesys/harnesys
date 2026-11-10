import type { JsonObject } from '@harnesys/sdk';
import { AddonException } from '../../../domain/addons/errors.ts';
import type { GrantEntry } from '../../../domain/addons/permissions.ts';
import type {
  AddonPackageCatalogPort,
  InstalledAddonPackage,
} from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import type {
  AddonAuditActor,
  AddonAuditEntry,
  AddonAuditPort,
} from '../../../domain/addons/ports/audit.port.ts';
import type {
  OrgAddonRepositoryPort,
  OrgAddonRow,
} from '../../../domain/addons/ports/org-addon-repository.port.ts';

export function addonNotFound(addonId: string, version?: string): AddonException {
  return new AddonException(
    'not_found',
    404,
    version
      ? `Addon package not installed: ${addonId}@${version}`
      : `Addon package not installed: ${addonId}`,
  );
}

export function requireOrgAddon(
  orgAddons: OrgAddonRepositoryPort,
  orgId: string,
  addonId: string,
): OrgAddonRow {
  const row = orgAddons.find(orgId, addonId);
  if (!row) {
    throw new AddonException('not_found', 404, `Addon is not enabled in organization: ${addonId}`);
  }
  return row;
}

export function requirePackage(
  catalog: AddonPackageCatalogPort,
  addonId: string,
  version?: string,
): InstalledAddonPackage {
  const pkg = catalog.find(addonId, version);
  if (!pkg) {
    throw addonNotFound(addonId, version);
  }
  return pkg;
}

export function grantsOfRow(row: OrgAddonRow): GrantEntry[] {
  try {
    const parsed: unknown = JSON.parse(row.grantsJson);
    return Array.isArray(parsed) ? (parsed as GrantEntry[]) : [];
  } catch {
    return [];
  }
}

export function jsonOf(raw: string | null | undefined): JsonObject {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as JsonObject)
      : {};
  } catch {
    return {};
  }
}

export function appendAudit(
  audit: AddonAuditPort,
  orgId: string,
  actor: AddonAuditActor,
  entry: Omit<AddonAuditEntry, 'actor' | 'at'>,
): void {
  audit.append(orgId, { ...entry, actor, at: new Date().toISOString() });
}
