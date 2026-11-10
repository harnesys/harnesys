import { Injectable } from '@harnesys/brix';
import { AddonPackageCatalogPort } from '../../../../domain/addons/ports/addon-package-catalog.port.ts';
import { OrgAddonRepositoryPort } from '../../../../domain/addons/ports/org-addon-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { AddonTransportRegistry } from '../../families/transport/transport.family.ts';
import { WorkerDescriptorStore } from '../../families/worker/worker.family.ts';
import type { ReasonsToLiveProvider } from '../../supervisor/supervisor-deps.ts';

function grantsInclude(grantsJson: string, permissionId: string): boolean {
  try {
    const parsed: unknown = JSON.parse(grantsJson);
    if (!Array.isArray(parsed)) {
      return false;
    }
    return parsed.some(
      (entry) =>
        !!entry && typeof entry === 'object' && (entry as { id?: unknown }).id === permissionId,
    );
  } catch {
    return false;
  }
}

/**
 * §8.2 reasons to live: enabled trigger instance, running (autostart) worker,
 * active transport binding, or resident activation with the `lifecycle.resident`
 * grant. In-flight calls are tracked by the supervisor itself.
 */
@Injectable()
export class AddonReasonsToLive implements ReasonsToLiveProvider {
  constructor(
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly catalog: AddonPackageCatalogPort,
    private readonly triggerInstances: TriggerInstanceRepositoryPort,
    private readonly workers: WorkerDescriptorStore,
    private readonly transports: AddonTransportRegistry,
  ) {}

  hasReason(orgId: string, addonId: string): boolean {
    if (this.triggerInstances.list(orgId, addonId).some((instance) => instance.enabled)) {
      return true;
    }
    if (this.workers.autostartOf(orgId, addonId).length > 0) {
      return true;
    }
    if (this.transports.find(orgId, addonId) !== undefined) {
      return true;
    }
    const row = this.orgAddons.find(orgId, addonId);
    const pkg = this.catalog.find(addonId, row?.version);
    if (!row?.enabled || !pkg || pkg.manifest.activation !== 'resident') {
      return false;
    }
    return grantsInclude(row.grantsJson, 'lifecycle.resident');
  }
}
