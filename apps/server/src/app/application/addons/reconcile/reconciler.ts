import { Inject, Injectable, Logger } from '@harnesys/brix';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { InstanceSupervisorPort } from '../../../domain/addons/ports/instance-supervisor.port.ts';
import type { OrgAddonRow } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';

const FIRE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TICK_MS = 30_000;

@Injectable()
export class AddonReconciler {
  private readonly logger: Logger;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly catalog: AddonPackageCatalogPort,
    private readonly supervisor: InstanceSupervisorPort,
    private readonly triggers: TriggerInstanceRepositoryPort,
    private readonly clock: ClockPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-reconciler');
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.reconcile();
    }, TICK_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async reconcile(): Promise<void> {
    this.triggers.cleanupFires(this.clock.now() - FIRE_TTL_MS);
    for (const row of this.orgAddons.listAll()) {
      await this.reconcileRow(row);
    }
  }

  private async reconcileRow(row: OrgAddonRow): Promise<void> {
    const snapshot = this.supervisor.snapshot(row.orgId, row.addonId);
    if (!row.enabled) {
      if (snapshot && (snapshot.state === 'running' || snapshot.state === 'starting')) {
        await this.supervisor.stop(row.orgId, row.addonId, 'disabled');
      }
      return;
    }
    if (snapshot?.state === 'quarantined' || !this.needsProcess(row)) {
      return;
    }
    try {
      await this.supervisor.ensureRunning(row.orgId, row.addonId, 'reconcile');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.supervisor.mirrorHealth(row.orgId, row.addonId, 'failed', message);
      this.logger.warn(
        { orgId: row.orgId, addonId: row.addonId, error: message },
        'reconcile start failed',
      );
    }
  }

  private needsProcess(row: { orgId: string; addonId: string; version: string }): boolean {
    const pkg = this.catalog.find(row.addonId, row.version);
    if (pkg?.manifest.activation === 'resident') {
      return true;
    }
    return this.triggers.list(row.orgId, row.addonId).some((instance) => instance.enabled);
  }
}
