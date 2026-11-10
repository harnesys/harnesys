import { Inject, Injectable, Logger } from '@harnesys/brix';
import { AddonInUseException } from '../../../domain/addons/errors.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { addonNotFound } from '../orgs/org-addon.helpers.ts';

export interface RemovePackageRequest {
  id: string;
  version: string;
  actor: { kind: 'user' | 'system' | 'host'; id: string };
}

const HOST_AUDIT_ORG = 'host';

@Injectable()
export class RemovePackageUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly catalog: AddonPackageCatalogPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly audit: AddonAuditPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-remove-package');
  }

  execute(request: RemovePackageRequest): void {
    const pkg = this.catalog.find(request.id, request.version);
    if (!pkg) {
      throw addonNotFound(request.id, request.version);
    }
    const pinned = this.orgAddons
      .listAll()
      .some((row) => row.addonId === request.id && row.version === request.version);
    if (pinned) {
      throw new AddonInUseException(
        `Version ${request.id}@${request.version} is pinned by at least one organization`,
      );
    }
    this.catalog.removePackage(request.id, request.version);
    this.dropLockEntry(request.id, request.version);
    this.audit.append(HOST_AUDIT_ORG, {
      at: new Date().toISOString(),
      actor: request.actor,
      action: 'addon.package.remove',
      target: `${request.id}@${request.version}`,
      outcome: 'ok',
    });
    this.logger.info({ addonId: request.id, version: request.version }, 'package removed');
  }

  private dropLockEntry(id: string, version: string): void {
    const lock = this.catalog.readLock();
    const entry = lock.entries.find((candidate) => candidate.id === id);
    if (entry && entry.version === version) {
      this.catalog.writeLock({ entries: lock.entries.filter((candidate) => candidate.id !== id) });
    }
  }
}
