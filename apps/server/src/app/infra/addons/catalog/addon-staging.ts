import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { type AddonManifest } from '@harnesys/sdk';
import type { InstalledAddonPackage } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import type {
  AddonStagePlan,
  AddonStageRequest,
} from '../../../domain/addons/ports/addon-source.port.ts';
import { AddonSourcePort } from '../../../domain/addons/ports/addon-source.port.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { computeAddonDigest, packageFiles } from './addon-digest.ts';
import {
  addonPackageDir,
  addonStagingDir,
  assertSafeAddonId,
  assertSafeVersion,
} from './addon-paths.ts';
import { loadAddonManifest } from './manifest-loader.ts';

export interface StagedAddon {
  planId: string;
  manifest: AddonManifest;
  digest: string;
  stagingRef: string;
  warnings: string[];
}

@Injectable()
export class BuiltinAddonSourceAdapter extends AddonSourcePort {
  private readonly layout: HostFsLayoutPort;
  private addOnsDir: string;
  private scanned: InstalledAddonPackage[] | null = null;

  constructor(layout: HostFsLayoutPort) {
    super();
    this.layout = layout;
    this.addOnsDir = monorepoAddOnsDir();
  }

  withAddOnsDir(dir: string): this {
    this.addOnsDir = dir;
    this.scanned = null;
    return this;
  }

  /** System add-ons shipped in the monorepo `add-ons/` directory are installed by definition. */
  scanPackages(): InstalledAddonPackage[] {
    if (this.scanned) {
      return this.scanned;
    }
    const found: InstalledAddonPackage[] = [];
    if (existsSync(this.addOnsDir)) {
      for (const entry of readdirSync(this.addOnsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue;
        }
        const root = join(this.addOnsDir, entry.name);
        const loaded = loadAddonManifest(root);
        if (!loaded.manifest) {
          continue;
        }
        found.push({
          id: loaded.manifest.id,
          version: loaded.manifest.version,
          digest: computeAddonDigest(root),
          source: entry.name,
          trust: 'builtin',
          root,
          manifest: loaded.manifest,
          installedAt: '',
        });
      }
    }
    this.scanned = found.sort((a, b) => a.id.localeCompare(b.id));
    return this.scanned;
  }

  invalidateScanCache(): void {
    this.scanned = null;
  }

  override async stage(request: AddonStageRequest): Promise<AddonStagePlan> {
    const staged = await stageAddonDirectory(
      this.layout.home(),
      monorepoAddonDir(this.addOnsDir, request.source),
    );
    return {
      planId: staged.planId,
      manifest: staged.manifest,
      digest: staged.digest,
      trust: 'builtin',
      stagingRef: staged.stagingRef,
      warnings: staged.warnings,
    };
  }

  override release(planId: string): void {
    releaseStaging(this.layout.home(), planId);
  }
}

export function monorepoAddOnsDir(): string {
  return resolve(import.meta.dir, '..', '..', '..', '..', '..', '..', '..', 'add-ons');
}

export function monorepoAddonDir(addOnsDir: string, name: string): string {
  assertSafeAddonId(name);
  return join(addOnsDir, name);
}

export async function stageAddonDirectory(home: string, sourceDir: string): Promise<StagedAddon> {
  if (!existsSync(sourceDir)) {
    throw new Error(`addon source directory not found: ${sourceDir}`);
  }
  const planId = crypto.randomUUID();
  const stagingRef = addonStagingDir(home, planId);
  try {
    mkdirSync(stagingRef, { recursive: true });
    // §4.1: only the runtime payload is staged, not the developer workspace.
    for (const filePath of packageFiles(sourceDir)) {
      const target = join(stagingRef, relative(sourceDir, filePath));
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(filePath, target);
    }
    const loaded = loadAddonManifest(stagingRef);
    if (!loaded.manifest) {
      throw new Error(
        `manifest invalid: ${loaded.violations.map((violation) => `${violation.path}: ${violation.message}`).join('; ')}`,
      );
    }
    assertSafeVersion(loaded.manifest.version);
    return {
      planId,
      manifest: loaded.manifest,
      digest: computeAddonDigest(stagingRef),
      stagingRef,
      warnings: loaded.violations.map((violation) => `${violation.path}: ${violation.message}`),
    };
  } catch (error) {
    rmSync(stagingRef, { recursive: true, force: true });
    throw error;
  }
}

export function releaseStaging(home: string, planId: string): void {
  rmSync(addonStagingDir(home, planId), { recursive: true, force: true });
}

export function moveStagedToPackageDir(
  home: string,
  manifest: AddonManifest,
  stagingRef: string,
): string {
  const target = addonPackageDir(home, manifest.id, manifest.version);
  if (!existsSync(stagingRef)) {
    // Staging already consumed (repeat confirm): the installed copy stays.
    if (existsSync(target)) {
      return target;
    }
    throw new Error(`addon staging not found: ${stagingRef}`);
  }
  // Same id@version replaces the installed copy (§4.6 confirm is idempotent;
  // a rebuilt package with a new digest replaces, confirm-install owns the check).
  rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  renameSync(stagingRef, target);
  return target;
}
