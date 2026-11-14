import { existsSync, lstatSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { addonsHomeDir } from './addon-paths.ts';

@Injectable()
export class AddonPackagePruner {
  constructor(
    private readonly catalog: AddonPackageCatalogPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  prune(orgIds: readonly string[]): string[] {
    const pinned = new Set<string>();
    for (const orgId of orgIds) {
      for (const row of this.orgAddons.list(orgId)) {
        pinned.add(`${row.addonId}@${row.version}`);
      }
    }
    const lock = this.catalog.readLock();
    const kept = new Set<string>();
    const removed: string[] = [];
    for (const entry of lock.entries) {
      const key = `${entry.id}@${entry.version}`;
      if (pinned.has(key)) {
        kept.add(key);
        continue;
      }
      this.catalog.removePackage(entry.id, entry.version);
      removed.push(key);
    }
    removed.push(...this.removeOrphanDirs(kept, pinned));
    return removed;
  }

  private removeOrphanDirs(knownKeys: Set<string>, pinned: Set<string>): string[] {
    const home = addonsHomeDir(this.layout.home());
    if (!existsSync(home)) {
      return [];
    }
    const removed: string[] = [];
    for (const id of readdirSync(home).sort()) {
      removed.push(...this.removeOrphanVersions(join(home, id), id, knownKeys, pinned));
    }
    return removed;
  }

  private removeOrphanVersions(
    idDir: string,
    id: string,
    knownKeys: Set<string>,
    pinned: Set<string>,
  ): string[] {
    if (id.startsWith('.') || !lstatSync(idDir).isDirectory()) {
      return [];
    }
    const removed: string[] = [];
    let versionsLeft = 0;
    for (const version of readdirSync(idDir).sort()) {
      const versionDir = join(idDir, version);
      if (!lstatSync(versionDir).isDirectory()) {
        continue;
      }
      const key = `${id}@${version}`;
      if (knownKeys.has(key) || pinned.has(key)) {
        versionsLeft += 1;
        continue;
      }
      rmSync(versionDir, { recursive: true, force: true });
      removed.push(key);
    }
    if (versionsLeft === 0 && readdirSync(idDir).length === 0) {
      rmSync(idDir, { recursive: true, force: true });
    }
    return removed;
  }
}
