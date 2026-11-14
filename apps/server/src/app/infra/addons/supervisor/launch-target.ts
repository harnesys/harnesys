import { join } from 'node:path';
import type { AddonTrust } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import type { SandboxProfile } from '../sandbox/sandbox-launcher.port.ts';

export interface LaunchTarget {
  readonly orgId: string;
  readonly addonId: string;
  readonly version: string;
  readonly packageRoot: string;
  readonly entryPath: string;
  readonly dataDir: string;
  readonly platform: number;
  readonly trust: AddonTrust;
  readonly profile: SandboxProfile;
}

export interface LaunchTargetDeps {
  readonly catalog: AddonPackageCatalogPort;
  readonly layout: HostFsLayoutPort;
  readonly repository: OrgAddonRepositoryPort;
}

export function resolvePinnedVersion(
  deps: LaunchTargetDeps,
  orgId: string,
  addonId: string,
): string {
  return deps.repository.find(orgId, addonId)?.version ?? 'latest';
}

export function buildLaunchTarget(
  deps: LaunchTargetDeps,
  orgId: string,
  addonId: string,
): LaunchTarget {
  const version = resolvePinnedVersion(deps, orgId, addonId);
  const installed = deps.catalog.find(addonId, version);
  if (!installed) {
    throw new Error(`addon package not installed: ${addonId}@${version}`);
  }
  return {
    orgId,
    addonId,
    version: installed.version,
    packageRoot: installed.root,
    entryPath: join(installed.root, installed.manifest.runtime.entry),
    dataDir: join(deps.layout.orgDataDir(orgId), 'addons', addonId),
    platform: installed.manifest.platform,
    trust: installed.trust,
    profile: installed.manifest.runtime.profile as SandboxProfile,
  };
}
