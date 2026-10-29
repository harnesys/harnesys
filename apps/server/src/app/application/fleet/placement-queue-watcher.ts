import { Injectable, Logger, type ModuleDestroyHook, type ModuleInitHook } from '@harnesys/brix';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';
import { MaterializationEventsPort } from '../../domain/source/materialization-events.port.ts';
import { ReschedulePlacementQueueUseCase } from './reschedule-placement-queue.use-case.ts';

@Injectable()
export class PlacementQueueWatcher implements ModuleInitHook, ModuleDestroyHook {
  private readonly log: Logger;
  private unsubFleet: (() => void) | null = null;
  private unsubMats: (() => void) | null = null;
  private started = false;

  constructor(
    private readonly fleetEvents: FleetEventsPort,
    private readonly materializationEvents: MaterializationEventsPort,
    private readonly reschedule: ReschedulePlacementQueueUseCase,
    logger: Logger,
  ) {
    this.log = logger.child('placement-queue-watcher');
  }

  onModuleInit(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.unsubFleet = this.fleetEvents.subscribe((orgId) => {
      void this.reschedule.execute({ orgId });
    });
    this.unsubMats = this.materializationEvents.subscribe((event) => {
      void this.reschedule.execute({ orgId: event.orgId });
    });
    void this.reschedule.reconcileAll().catch((err) => {
      this.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'placement queue reconcile on start failed',
      );
    });
  }

  onModuleDestroy(): void {
    this.unsubFleet?.();
    this.unsubMats?.();
    this.unsubFleet = null;
    this.unsubMats = null;
    this.started = false;
  }
}
