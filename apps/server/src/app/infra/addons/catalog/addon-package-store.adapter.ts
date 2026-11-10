import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { Injectable, Logger } from '@harnesys/brix';
import type {
  AddonInstallRequest,
  AddonLockEntry,
  AddonLockFile,
  InstalledAddonPackage,
} from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { AddonLock, lockEntryFor } from './addon-lock.ts';
import {
  addonPackageDir,
  addonsHomeDir,
  assertSafeAddonId,
  assertSafeVersion,
} from './addon-paths.ts';
import { moveStagedToPackageDir } from './addon-staging.ts';
import { loadAddonManifest } from './manifest-loader.ts';

@Injectable()
export class AddonPackageStoreAdapter extends AddonPackageCatalogPort {
  private readonly lock: AddonLock;
  private readonly log: Logger;

  constructor(
    private readonly layout: HostFsLayoutPort,
    logger: Logger,
  ) {
    super();
    this.lock = new AddonLock(layout.home());
    this.log = logger.child('addon-package-store');
  }

  override listInstalled(): InstalledAddonPackage[] {
    const packages: InstalledAddonPackage[] = [];
    for (const entry of this.lock.read().entries) {
      const installed = this.readInstalled(entry);
      if (installed) {
        packages.push(installed);
      }
    }
    return packages.sort((a, b) => a.id.localeCompare(b.id));
  }

  override find(id: string, version?: string): InstalledAddonPackage | undefined {
    if (version !== undefined) {
      return this.readInstalled(this.lock.entry(id, version));
    }
    const candidates = this.lock
      .read()
      .entries.filter((entry) => entry.id === id)
      .map((entry) => this.readInstalled(entry))
      .filter((installed) => installed !== undefined)
      .sort((a, b) => b.version.localeCompare(a.version));
    return candidates[0];
  }

  override readLock(): AddonLockFile {
    return this.lock.read();
  }

  override writeLock(lock: AddonLockFile): void {
    this.lock.write(lock);
  }

  override removePackage(id: string, version: string): void {
    assertSafeAddonId(id);
    assertSafeVersion(version);
    rmSync(addonPackageDir(this.layout.home(), id, version), { recursive: true, force: true });
    this.lock.remove(id, version);
  }

  override install(request: AddonInstallRequest): InstalledAddonPackage {
    const target = moveStagedToPackageDir(this.layout.home(), request.manifest, request.stagingRef);
    this.lock.confirm(
      lockEntryFor({
        id: request.manifest.id,
        version: request.manifest.version,
        digest: request.digest,
        source: request.source,
        trust: request.trust,
        installedAt: new Date().toISOString(),
      }),
    );
    const installed = this.find(request.manifest.id, request.manifest.version);
    if (!installed) {
      throw new Error(
        `package not found after install: ${request.manifest.id}@${request.manifest.version}`,
      );
    }
    this.log.info(
      { addonId: request.manifest.id, version: request.manifest.version, target },
      'addon package installed',
    );
    return installed;
  }

  ensureHomeDir(): string {
    mkdirSync(addonsHomeDir(this.layout.home()), { recursive: true });
    return addonsHomeDir(this.layout.home());
  }

  private readInstalled(entry: AddonLockEntry | undefined): InstalledAddonPackage | undefined {
    if (!entry) {
      return undefined;
    }
    const root = addonPackageDir(this.layout.home(), entry.id, entry.version);
    if (!existsSync(root)) {
      this.log.warn(
        { addonId: entry.id, version: entry.version },
        'lock entry without package dir',
      );
      return undefined;
    }
    const loaded = loadAddonManifest(root);
    if (!loaded.manifest) {
      this.log.warn(
        { addonId: entry.id, version: entry.version, violations: loaded.violations },
        'installed package manifest invalid',
      );
      return undefined;
    }
    return {
      id: entry.id,
      version: entry.version,
      digest: entry.digest,
      source: entry.source,
      trust: entry.trust,
      root,
      manifest: loaded.manifest,
      installedAt: entry.installedAt,
    };
  }
}
