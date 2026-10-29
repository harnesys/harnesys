import { Injectable, Logger, type ModuleDestroyHook, type ModuleInitHook } from '@harnesys/brix';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { WAIT_TICK_INTERVAL_MS } from '../../domain/thread/run-wait-timer.ts';
import { WaitTickerGatePort } from '../../domain/thread/wait-ticker-gate.port.ts';

@Injectable()
export class TickWaitTimersUseCase implements ModuleInitHook, ModuleDestroyHook {
  private readonly log: Logger;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly orgs: OrgMachineStore,
    private readonly executor: LocalExecutorPort,
    private readonly gate: WaitTickerGatePort,
    logger: Logger,
  ) {
    this.log = logger.child('wait-ticker');
  }

  onModuleInit(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, WAIT_TICK_INTERVAL_MS);
    void this.scanPendingOnBoot();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async scanPendingOnBoot(): Promise<void> {
    for (const entry of this.orgs.list()) {
      try {
        if ((await this.executor.countWaitingTimers(entry.orgId)) > 0) {
          this.gate.hold(entry.orgId);
        }
      } catch (err) {
        this.log.warn(
          { orgId: entry.orgId, err: err instanceof Error ? err.message : String(err) },
          'wait scan failed',
        );
      }
    }
  }

  private async tick(): Promise<void> {
    for (const orgId of this.gate.active()) {
      try {
        await this.executor.tickWaitTimers(orgId);
        if ((await this.executor.countWaitingTimers(orgId)) === 0) {
          this.gate.release(orgId);
        }
      } catch (err) {
        this.log.warn(
          { orgId, err: err instanceof Error ? err.message : String(err) },
          'wait tick failed',
        );
      }
    }
  }
}
