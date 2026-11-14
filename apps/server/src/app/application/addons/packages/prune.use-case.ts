import { Inject, Injectable, Logger } from '@harnesys/brix';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';

const HOST_AUDIT_ORG = 'host';

export interface PruneResult {
  removed: Array<{ id: string; version: string }>;
}

@Injectable()
export class PrunePackagesUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly catalog: AddonPackageCatalogPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly audit: AddonAuditPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-prune');
  }

  execute(actor: { kind: 'user' | 'system' | 'host'; id: string }): PruneResult {
    const pinned = new Set(this.orgAddons.listAll().map((row) => `${row.addonId}@${row.version}`));
    const removed: Array<{ id: string; version: string }> = [];
    const lock = this.catalog.readLock();
    let lockChanged = false;
    const keptEntries = lock.entries.filter((entry) => {
      if (pinned.has(`${entry.id}@${entry.version}`)) {
        return true;
      }
      const pkg = this.catalog.find(entry.id, entry.version);
      if (!pkg || pkg.trust === 'builtin') {
        return true;
      }
      this.catalog.removePackage(entry.id, entry.version);
      removed.push({ id: entry.id, version: entry.version });
      lockChanged = true;
      return false;
    });
    if (lockChanged) {
      this.catalog.writeLock({ entries: keptEntries });
    }
    if (removed.length > 0) {
      this.audit.append(HOST_AUDIT_ORG, {
        at: new Date().toISOString(),
        actor,
        action: 'addon.package.prune',
        target: removed.map((entry) => `${entry.id}@${entry.version}`).join(','),
        outcome: 'ok',
        details: { removed: removed.length },
      });
    }
    this.logger.info({ removed: removed.length }, 'prune finished');
    return { removed };
  }
}
