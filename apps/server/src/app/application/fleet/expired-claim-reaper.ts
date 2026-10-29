import { Injectable, Logger, type ModuleDestroyHook, type ModuleInitHook } from '@harnesys/brix';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { ReapExpiredRunClaimsUseCase } from './reap-expired-run-claims.use-case.ts';

const REAP_INTERVAL_MS = 30_000;

@Injectable()
export class ExpiredClaimReaper implements ModuleInitHook, ModuleDestroyHook {
  private readonly log: Logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(
    private readonly store: OrgMachineStore,
    private readonly reap: ReapExpiredRunClaimsUseCase,
    logger: Logger,
  ) {
    this.log = logger.child('expired-claim-reaper');
  }

  onModuleInit(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.timer = setInterval(() => {
      this.reapAll();
    }, REAP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.started = false;
  }

  private reapAll(): void {
    for (const entry of this.store.list()) {
      if (entry.role !== 'relay') {
        continue;
      }
      void this.reap
        .execute({ orgId: entry.orgId })
        .then((result) => {
          if (result.reaped > 0) {
            this.log.info(
              { orgId: entry.orgId, reaped: result.reaped },
              'reaped runs with expired worker leases',
            );
          }
        })
        .catch((err: unknown) => {
          this.log.warn(
            { orgId: entry.orgId, err: err instanceof Error ? err.message : String(err) },
            'expired claim reap failed',
          );
        });
    }
  }
}
