import type { AddonManifest } from '@harnesys/sdk';

export type AddonTrust = 'builtin' | 'local' | 'external';

export interface AddonLockEntry {
  id: string;
  version: string;
  digest: string;
  source: string;
  trust: AddonTrust;
  installedAt: string;
}

export interface AddonLockFile {
  entries: AddonLockEntry[];
}

export interface InstalledAddonPackage {
  id: string;
  version: string;
  digest: string;
  source: string;
  trust: AddonTrust;
  root: string;
  manifest: AddonManifest;
  installedAt: string;
}

export interface AddonInstallRequest {
  stagingRef: string;
  manifest: AddonManifest;
  digest: string;
  source: string;
  trust: AddonTrust;
}

export interface AddonRescanAdded {
  id: string;
  version: string;
}

export interface AddonRescanResult {
  added: AddonRescanAdded[];
}

export abstract class AddonPackageCatalogPort {
  abstract listInstalled(): InstalledAddonPackage[];

  abstract find(id: string, version?: string): InstalledAddonPackage | undefined;

  abstract readLock(): AddonLockFile;

  abstract writeLock(lock: AddonLockFile): void;

  abstract removePackage(id: string, version: string): void;

  abstract install(request: AddonInstallRequest): InstalledAddonPackage;

  /** Registers package directories placed manually into the host add-ons directory. */
  abstract rescanHomeDir(): AddonRescanResult;
}
