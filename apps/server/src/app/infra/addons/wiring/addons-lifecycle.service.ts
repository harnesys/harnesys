import {
  Inject,
  Injectable,
  Logger,
  type ModuleDestroyHook,
  type ModuleInitHook,
} from '@harnesys/brix';
import { AddonJobScheduler } from '../../../application/addons/jobs/schedule-jobs.service.ts';
import { AddonReconciler } from '../../../application/addons/reconcile/reconciler.ts';
import type { OwnerKey } from '../../../domain/addons/owner.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { ContributionRegistryPort } from '../../../domain/addons/ports/contribution-registry.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { AccountsChangedForwarder } from '../apps-bridge/accounts-changed.forwarder.ts';
import { AddonDbAccessAdapter } from './addon-db-access.adapter.ts';
import { AddonEventForwarder } from './addon-event-forwarder.ts';
import { AccountsChangedNotifySink } from './addon-notify.adapter.ts';
import { ContributionHandlersValidator } from './supervisor-hooks/contribution-handlers-validator.ts';
import { DispatcherRequestHandler } from './supervisor-hooks/dispatcher-request-handler.ts';
import { InstanceReplayHook } from './supervisor-hooks/instance-replay-hook.ts';
import { ManifestPermissionProvider } from './supervisor-hooks/manifest-permission-provider.ts';
import { AddonReasonsToLive } from './supervisor-hooks/reasons-to-live.ts';
import { WiredSupervisorHooks } from './supervisor-hooks/wired-supervisor-hooks.ts';

/**
 * Binds the supervisor hook implementations once the container is fully
 * constructed, re-registers contributions of every enabled add-on (§8.2: the
 * registry is in-memory, so a server restart must rebuild it before the
 * reconciler and the job scheduler tick), then starts the reconciler tick and
 * the job scheduler (§8.3 lifecycle wiring), mirroring the EventsWatchBridge
 * pattern.
 */
@Injectable()
export class AddonsLifecycleService implements ModuleInitHook, ModuleDestroyHook {
  private readonly log: Logger;

  constructor(
    private readonly hooks: WiredSupervisorHooks,
    private readonly requestHandler: DispatcherRequestHandler,
    private readonly permissionsProvider: ManifestPermissionProvider,
    private readonly handlersValidator: ContributionHandlersValidator,
    private readonly replayHook: InstanceReplayHook,
    private readonly reasonsToLive: AddonReasonsToLive,
    private readonly forwarder: AccountsChangedForwarder,
    private readonly accountsChangedSink: AccountsChangedNotifySink,
    private readonly events: AddonEventForwarder,
    private readonly reconciler: AddonReconciler,
    private readonly jobs: AddonJobScheduler,
    private readonly databases: AddonDbAccessAdapter,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly catalog: AddonPackageCatalogPort,
    private readonly registry: ContributionRegistryPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.log = logger.child('addons-lifecycle');
  }

  onModuleInit(): void {
    this.hooks.bind({
      requestHandler: this.requestHandler,
      permissionsProvider: this.permissionsProvider,
      handlersValidator: this.handlersValidator,
      replayHook: this.replayHook,
      reasonsToLive: this.reasonsToLive,
    });
    this.forwarder.setSink(this.accountsChangedSink);
    this.bootRegisterContributions();
    this.events.syncOrgs();
    this.reconciler.start();
    this.jobs.start();
  }

  onModuleDestroy(): void {
    this.reconciler.stop();
    this.jobs.stop();
    this.events.stop();
    this.databases.closeAll();
  }

  /**
   * Re-registers contributions for every enabled org_addons row (§8.2).
   * Idempotent: active owners are skipped; a failing addon is logged, marked
   * with last_error, and skipped — boot must not die.
   */
  private bootRegisterContributions(): void {
    for (const row of this.orgAddons.listAll()) {
      if (!row.enabled) {
        continue;
      }
      const owner: OwnerKey = {
        orgId: row.orgId,
        addonId: row.addonId,
        version: row.version,
      };
      if (this.registry.isActive(owner)) {
        continue;
      }
      const pkg = this.catalog.find(row.addonId, row.version);
      if (!pkg) {
        this.log.warn(
          { orgId: row.orgId, addonId: row.addonId, version: row.version },
          'boot registration skipped: pinned package is not installed',
        );
        continue;
      }
      try {
        this.registry.activate(owner, pkg.manifest);
      } catch (error) {
        this.log.warn(
          { orgId: row.orgId, addonId: row.addonId, version: row.version, error: String(error) },
          'boot registration failed; addon skipped',
        );
        this.orgAddons.updateHealth(row.orgId, row.addonId, row.health, 'internal');
      }
    }
  }
}
