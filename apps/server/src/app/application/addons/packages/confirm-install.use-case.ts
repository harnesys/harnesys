import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { InstallPlan } from '@harnesys/contracts';
import { AddonException, AddonInUseException } from '../../../domain/addons/errors.ts';
import type { InstalledAddonPackage } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonSourcePort } from '../../../domain/addons/ports/addon-source.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import type { StagedInstallPlan } from './plan-store.ts';
import { InstallPlanStore } from './plan-store.ts';
import { toInstallPlan } from './plan-view.ts';

const HOST_AUDIT_ORG = 'host';

export interface ConfirmInstallRequest {
  planId: string;
  actor: { kind: 'user' | 'system' | 'host'; id: string };
}

@Injectable()
export class ConfirmInstallUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly store: InstallPlanStore,
    private readonly catalog: AddonPackageCatalogPort,
    private readonly sources: AddonSourcePort,
    private readonly audit: AddonAuditPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-confirm-install');
  }

  async execute(request: ConfirmInstallRequest): Promise<InstallPlan> {
    const plan = this.store.take(request.planId);
    if (!plan) {
      throw new AddonException('not_found', 404, `Install plan not found: ${request.planId}`);
    }
    const installed = this.installPackage(plan);
    this.writeLock(installed);
    this.sources.release(plan.planId);
    this.audit.append(HOST_AUDIT_ORG, {
      at: new Date().toISOString(),
      actor: request.actor,
      action: 'addon.package.confirm_install',
      target: `${installed.id}@${installed.version}`,
      outcome: 'ok',
      details: { digest: installed.digest, source: installed.source, trust: installed.trust },
    });
    this.logger.info(
      { addonId: installed.id, version: installed.version, digest: installed.digest },
      'package installed',
    );
    return planOf(installed, plan);
  }

  private installPackage(plan: StagedInstallPlan): InstalledAddonPackage {
    const existing = this.catalog.find(plan.manifest.id, plan.manifest.version);
    if (existing) {
      if (existing.digest !== plan.digest) {
        throw new AddonInUseException(
          `Package ${plan.manifest.id}@${plan.manifest.version} is already installed with another digest`,
        );
      }
      return existing;
    }
    return this.catalog.install({
      stagingRef: plan.stagingRef,
      manifest: plan.manifest,
      digest: plan.digest,
      source: plan.source,
      trust: plan.trust,
    });
  }

  private writeLock(pkg: InstalledAddonPackage): void {
    const lock = this.catalog.readLock();
    const rest = lock.entries.filter(
      (entry) => entry.id !== pkg.id || entry.version !== pkg.version,
    );
    this.catalog.writeLock({
      entries: [
        ...rest,
        {
          id: pkg.id,
          version: pkg.version,
          digest: pkg.digest,
          source: pkg.source,
          trust: pkg.trust,
          installedAt: pkg.installedAt,
        },
      ],
    });
  }
}

function planOf(pkg: InstalledAddonPackage, plan: StagedInstallPlan): InstallPlan {
  return toInstallPlan({ ...plan, digest: pkg.digest, warnings: plan.warnings });
}
