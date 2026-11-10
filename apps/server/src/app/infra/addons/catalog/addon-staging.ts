import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { AddonManifest } from '@harnesys/sdk';
import type {
  AddonStagePlan,
  AddonStageRequest,
} from '../../../domain/addons/ports/addon-source.port.ts';
import { AddonSourcePort } from '../../../domain/addons/ports/addon-source.port.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { computeAddonDigest } from './addon-digest.ts';
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

  constructor(layout: HostFsLayoutPort) {
    super();
    this.layout = layout;
    this.addOnsDir = monorepoAddOnsDir();
  }

  withAddOnsDir(dir: string): this {
    this.addOnsDir = dir;
    return this;
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
  mkdirSync(stagingRef, { recursive: true });
  cpSync(sourceDir, stagingRef, { recursive: true });
  const loaded = loadAddonManifest(stagingRef);
  if (!loaded.manifest) {
    rmSync(stagingRef, { recursive: true, force: true });
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
  if (existsSync(target)) {
    rmSync(stagingRef, { recursive: true, force: true });
    return target;
  }
  mkdirSync(dirname(target), { recursive: true });
  renameSync(stagingRef, target);
  return target;
}
