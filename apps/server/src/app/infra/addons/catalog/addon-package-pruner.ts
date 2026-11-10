import { Injectable } from '@harnesys/brix';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';

@Injectable()
export class AddonPackagePruner {
  constructor(
    private readonly catalog: AddonPackageCatalogPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
  ) {}

  prune(orgIds: readonly string[]): string[] {
    const pinned = new Set<string>();
    for (const orgId of orgIds) {
      for (const row of this.orgAddons.list(orgId)) {
        pinned.add(`${row.addonId}@${row.version}`);
      }
    }
    const removed: string[] = [];
    for (const entry of this.catalog.readLock().entries) {
      if (pinned.has(`${entry.id}@${entry.version}`)) {
        continue;
      }
      this.catalog.removePackage(entry.id, entry.version);
      removed.push(`${entry.id}@${entry.version}`);
    }
    return removed;
  }
}
