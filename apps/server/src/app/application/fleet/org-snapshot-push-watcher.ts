import { Injectable, Logger, type ModuleDestroyHook, type ModuleInitHook } from '@harnesys/brix';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { BuildOrgExecutionSnapshotUseCase } from './build-org-execution-snapshot.use-case.ts';

const TICK_MS = 2000;

@Injectable()
export class OrgSnapshotPushWatcher implements ModuleInitHook, ModuleDestroyHook {
  private readonly log: Logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    private readonly orgs: OrgMachineStore,
    private readonly hub: FleetHubPort,
    private readonly buildSnapshot: BuildOrgExecutionSnapshotUseCase,
    logger: Logger,
  ) {
    this.log = logger.child('org-snapshot-push');
  }

  onModuleInit(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_MS);
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    try {
      for (const org of this.orgs.list()) {
        if (org.role !== 'relay') {
          continue;
        }
        if (this.hub.peerNodeIds(org.orgId).length === 0) {
          continue;
        }
        try {
          this.buildSnapshot.execute(org.orgId);
        } catch (err) {
          this.log.warn(
            { orgId: org.orgId, err: err instanceof Error ? err.message : String(err) },
            'org snapshot push tick failed',
          );
        }
      }
    } finally {
      this.ticking = false;
    }
  }
}
