import { Injectable, type ModuleDestroyHook, type ModuleInitHook } from '@harnesys/brix';
import { AddonJobScheduler } from '../../../application/addons/jobs/schedule-jobs.service.ts';
import { AddonReconciler } from '../../../application/addons/reconcile/reconciler.ts';
import { AccountsChangedForwarder } from '../apps-bridge/accounts-changed.forwarder.ts';
import { AddonDbAccessAdapter } from './addon-db-access.adapter.ts';
import { AccountsChangedNotifySink } from './addon-notify.adapter.ts';
import { ContributionHandlersValidator } from './supervisor-hooks/contribution-handlers-validator.ts';
import { DispatcherRequestHandler } from './supervisor-hooks/dispatcher-request-handler.ts';
import { InstanceReplayHook } from './supervisor-hooks/instance-replay-hook.ts';
import { ManifestPermissionProvider } from './supervisor-hooks/manifest-permission-provider.ts';
import { AddonReasonsToLive } from './supervisor-hooks/reasons-to-live.ts';
import { WiredSupervisorHooks } from './supervisor-hooks/wired-supervisor-hooks.ts';

/**
 * Binds the supervisor hook implementations once the container is fully
 * constructed, then starts the reconciler tick and the job scheduler
 * (§8.3 lifecycle wiring), mirroring the EventsWatchBridge pattern.
 */
@Injectable()
export class AddonsLifecycleService implements ModuleInitHook, ModuleDestroyHook {
  constructor(
    private readonly hooks: WiredSupervisorHooks,
    private readonly requestHandler: DispatcherRequestHandler,
    private readonly permissionsProvider: ManifestPermissionProvider,
    private readonly handlersValidator: ContributionHandlersValidator,
    private readonly replayHook: InstanceReplayHook,
    private readonly reasonsToLive: AddonReasonsToLive,
    private readonly forwarder: AccountsChangedForwarder,
    private readonly accountsChangedSink: AccountsChangedNotifySink,
    private readonly reconciler: AddonReconciler,
    private readonly jobs: AddonJobScheduler,
    private readonly databases: AddonDbAccessAdapter,
  ) {}

  onModuleInit(): void {
    this.hooks.bind({
      requestHandler: this.requestHandler,
      permissionsProvider: this.permissionsProvider,
      handlersValidator: this.handlersValidator,
      replayHook: this.replayHook,
      reasonsToLive: this.reasonsToLive,
    });
    this.forwarder.setSink(this.accountsChangedSink);
    this.reconciler.start();
    this.jobs.start();
  }

  onModuleDestroy(): void {
    this.reconciler.stop();
    this.jobs.stop();
    this.databases.closeAll();
  }
}
