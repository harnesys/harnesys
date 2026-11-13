import { Module } from '@harnesys/brix';
import { AddonDataPort } from '../../../application/addons/addon-data.port.ts';
import { AddonRpcPort } from '../../../application/addons/addon-rpc.port.ts';
import { AddonsApplicationModule } from '../../../application/addons/addons-application.module.ts';
import { RunJobUseCase } from '../../../application/addons/jobs/run-job.use-case.ts';
import { AddonJobScheduler } from '../../../application/addons/jobs/schedule-jobs.service.ts';
import { DisableAddonUseCase } from '../../../application/addons/orgs/disable.use-case.ts';
import { EnableAddonUseCase } from '../../../application/addons/orgs/enable.use-case.ts';
import { RollbackAddonUseCase } from '../../../application/addons/orgs/rollback.use-case.ts';
import { SetBindingsUseCase } from '../../../application/addons/orgs/set-bindings.use-case.ts';
import { SetConfigUseCase } from '../../../application/addons/orgs/set-config.use-case.ts';
import { SetGrantsUseCase } from '../../../application/addons/orgs/set-grants.use-case.ts';
import { UninstallAddonUseCase } from '../../../application/addons/orgs/uninstall.use-case.ts';
import { UpdateAddonUseCase } from '../../../application/addons/orgs/update.use-case.ts';
import { ConfirmInstallUseCase } from '../../../application/addons/packages/confirm-install.use-case.ts';
import { PlanInstallUseCase } from '../../../application/addons/packages/plan-install.use-case.ts';
import { InstallPlanStore } from '../../../application/addons/packages/plan-store.ts';
import { PrunePackagesUseCase } from '../../../application/addons/packages/prune.use-case.ts';
import { RemovePackageUseCase } from '../../../application/addons/packages/remove-package.use-case.ts';
import { RescanPackagesUseCase } from '../../../application/addons/packages/rescan-packages.use-case.ts';
import { UploadInstallArchiveUseCase } from '../../../application/addons/packages/upload-install-archive.use-case.ts';
import { AddonReconciler } from '../../../application/addons/reconcile/reconciler.ts';
import { RunDispatchPort } from '../../../application/addons/run-dispatch.port.ts';
import { AddonCloudMaterializer } from '../../../application/addons/sources/addon-cloud.materializer.ts';
import { AttachAddonCloudSourceUseCase } from '../../../application/addons/sources/attach-addon-cloud-source.use-case.ts';
import { BrowseAddonCloudFolderUseCase } from '../../../application/addons/sources/browse-addon-cloud-folder.use-case.ts';
import { ListAddonCloudSourcesUseCase } from '../../../application/addons/sources/list-addon-cloud-sources.use-case.ts';
import { PrepareAddonCloudSourceUseCase } from '../../../application/addons/sources/prepare-addon-cloud-source.use-case.ts';
import { RefreshAddonCloudSourceUseCase } from '../../../application/addons/sources/refresh-addon-cloud-source.use-case.ts';
import { FireTriggerUseCase } from '../../../application/addons/triggers/fire-trigger.use-case.ts';
import { ManageTriggerInstanceUseCase } from '../../../application/addons/triggers/manage-instance.use-case.ts';
import { AccountsFacadePort } from '../../../application/apps/accounts-facade.port.ts';
import { AppsUseCaseModule } from '../../../application/apps/apps.use-case.module.ts';
import { ThreadUseCaseModule } from '../../../application/threads/thread.use-case.module.ts';
import { ContributionRegistry } from '../../../domain/addons/contribution-registry.ts';
import { AddonCallPort } from '../../../domain/addons/ports/addon-call.port.ts';
import { AddonNotifyPort } from '../../../domain/addons/ports/addon-notify.port.ts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import {
  AddonConfigReadPort,
  AddonDataExportPort,
  AddonLogReaderPort,
} from '../../../domain/addons/ports/addon-read-models.port.ts';
import { AddonSourcePort } from '../../../domain/addons/ports/addon-source.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import { BindingRepositoryPort } from '../../../domain/addons/ports/binding-repository.port.ts';
import { ContributionRegistryPort } from '../../../domain/addons/ports/contribution-registry.port.ts';
import { GrantPolicyPort } from '../../../domain/addons/ports/grant-policy.port.ts';
import { InstanceSupervisorPort } from '../../../domain/addons/ports/instance-supervisor.port.ts';
import { JobStateRepositoryPort } from '../../../domain/addons/ports/job-state-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { PermissionDefinitionsPort } from '../../../domain/addons/ports/permission-definitions.port.ts';
import { AddonRouteTablePort } from '../../../domain/addons/ports/route-table.port.ts';
import { AddonTransportBindingRepositoryPort } from '../../../domain/addons/ports/transport-binding-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { InboundEventPort } from '../../../domain/apps/ports/inbound-event.port.ts';
import { EventBusPort } from '../../../domain/events/event-bus.port.ts';
import { MetricsPort } from '../../../domain/metrics/metrics.port.ts';
import { SecretStorePort } from '../../../domain/secret/secret-store.port.ts';
import { AppsModule } from '../../apps/apps.module.ts';
import { EventsModule } from '../../events/events.module.ts';
import { FleetHubModule } from '../../fleet-hub/fleet-hub.module.ts';
import { MachineHomeModule } from '../../machine-home/machine-home.module.ts';
import { SecretModule } from '../../secret/secret.module.ts';
import { AddonAppsBridgeModule } from '../apps-bridge/apps-bridge.module.ts';
import { InboundAttachmentResolver } from '../bridge/inbound-attachment.resolver.ts';
import { AddonCatalogModule } from '../catalog/catalog.module.ts';
import { DispatcherModule } from '../dispatcher/dispatcher.module.ts';
import { PermissionDefinitionRegistry } from '../dispatcher/permission-definitions.ts';
import { PermissionEngine } from '../dispatcher/permission-engine.ts';
import { AddonConfigReadModel, ConfigNotifier } from '../families/config/config.family.ts';
import { AddonFamiliesModule } from '../families/families.module.ts';
import { FamilyModuleList } from '../families/family-module-list.ts';
import { HookDeliveryService } from '../families/hook/hook.family.ts';
import { AddonRouteTable } from '../families/route/route.family.ts';
import { TransportInboundService } from '../families/transport/transport.family.ts';
import {
  AddonTriggerCatalogContributor,
  TriggerFamilyModule,
} from '../families/trigger/trigger.family.ts';
import { TriggerFireService } from '../families/trigger/trigger-fire.sink.ts';
import { WorkerDescriptorStore, WorkerFamilyModule } from '../families/worker/worker.family.ts';
import {
  AddonDbAccess,
  AddonSecrets,
  BindingsReader,
  BridgeInboundSink,
  LogSink,
  TriggerFireSink,
  WorkerReportSink,
} from '../services/sinks.ts';
import { TransportSessionAsk } from '../sessions/transport-session.ask.ts';
import { TransportSessionDrafts } from '../sessions/transport-session.drafts.ts';
import { TransportSessionService } from '../sessions/transport-session.service.ts';
import { AddonSourceModule } from '../source/addon-source.module.ts';
import { AddonSecretService } from '../storage/addon-secret.service.ts';
import { AddonStorageModule } from '../storage/storage.module.ts';
import { AddonSupervisorModule } from '../supervisor/supervisor.module.ts';
import { SupervisorHooks } from '../supervisor/supervisor-deps.ts';
import { OrgAuditAddonAdapter } from './addon-audit.adapter.ts';
import { AddonDbAccessAdapter } from './addon-db-access.adapter.ts';
import { AddonEventForwarder } from './addon-event-forwarder.ts';
import {
  BridgeInboundSinkAdapter,
  TriggerFireSinkAdapter,
  WorkerReportSinkAdapter,
} from './addon-family-sinks.adapter.ts';
import { AddonLogSinkAdapter } from './addon-log-sink.adapter.ts';
import {
  AccountsChangedNotifySink,
  AddonDataRemoveAdapter,
  SupervisorNotifyAdapter,
  SupervisorRpcAdapter,
} from './addon-notify.adapter.ts';
import {
  AddonConfigReadAdapter,
  AddonDataExportAdapter,
  AddonLogReaderAdapter,
  PermissionDefinitionsPortAdapter,
  RouteTablePortAdapter,
} from './addon-read-models.adapter.ts';
import { CompositeAddonSourceAdapter } from './addon-source-composite.adapter.ts';
import { AddonSecretsAdapter, BindingsReaderAdapter } from './addon-storage-sinks.adapter.ts';
import { AddonsLifecycleService } from './addons-lifecycle.service.ts';
import { FileGrantPolicyAdapter } from './grant-policy.adapter.ts';
import { ContributionHandlersValidator } from './supervisor-hooks/contribution-handlers-validator.ts';
import { DispatcherRequestHandler } from './supervisor-hooks/dispatcher-request-handler.ts';
import { InstanceReplayHook } from './supervisor-hooks/instance-replay-hook.ts';
import { ManifestPermissionProvider } from './supervisor-hooks/manifest-permission-provider.ts';
import { AddonReasonsToLive } from './supervisor-hooks/reasons-to-live.ts';
import { WiredSupervisorHooks } from './supervisor-hooks/wired-supervisor-hooks.ts';

/**
 * Composition point of the addon platform: imports every parallel-built
 * module, binds ports to adapters, and is registered globally so addon
 * sub-modules and REST controllers can see the addon tokens.
 */
@Module({
  global: true,
  imports: [
    AddonCatalogModule,
    AddonStorageModule,
    AddonSupervisorModule,
    DispatcherModule,
    AddonFamiliesModule,
    AddonSourceModule,
    AddonAppsBridgeModule,
    AddonsApplicationModule,
    EventsModule,
    MachineHomeModule,
    AppsModule,
    ThreadUseCaseModule,
    SecretModule,
    AppsUseCaseModule,
    FleetHubModule,
  ],
  providers: [
    { provide: GrantPolicyPort, useClass: FileGrantPolicyAdapter },
    { provide: AddonAuditPort, useClass: OrgAuditAddonAdapter },
    { provide: AddonSourcePort, useClass: CompositeAddonSourceAdapter },
    {
      provide: ContributionRegistryPort,
      useFactory: (families: FamilyModuleList) => new ContributionRegistry(families.modules),
      inject: [FamilyModuleList],
    },
    {
      provide: AddonDbAccess,
      useFactory: (db: AddonDbAccessAdapter) => db,
      inject: [AddonDbAccessAdapter],
    },
    AddonDbAccessAdapter,
    { provide: AddonSecrets, useClass: AddonSecretsAdapter },
    {
      provide: LogSink,
      useFactory: (log: AddonLogSinkAdapter) => log,
      inject: [AddonLogSinkAdapter],
    },
    AddonLogSinkAdapter,
    { provide: BindingsReader, useClass: BindingsReaderAdapter },
    { provide: TriggerFireSink, useClass: TriggerFireSinkAdapter },
    InboundAttachmentResolver,
    { provide: BridgeInboundSink, useClass: BridgeInboundSinkAdapter },
    { provide: WorkerReportSink, useClass: WorkerReportSinkAdapter },
    { provide: AddonNotifyPort, useClass: SupervisorNotifyAdapter },
    { provide: AddonRpcPort, useClass: SupervisorRpcAdapter },
    { provide: AddonDataPort, useClass: AddonDataRemoveAdapter },
    AccountsChangedNotifySink,
    AddonEventForwarder,
    AddonsLifecycleService,
    TransportSessionDrafts,
    TransportSessionAsk,
    TransportSessionService,
    DispatcherRequestHandler,
    ManifestPermissionProvider,
    ContributionHandlersValidator,
    InstanceReplayHook,
    AddonReasonsToLive,
    WiredSupervisorHooks,
    {
      provide: SupervisorHooks,
      useFactory: (hooks: WiredSupervisorHooks) => hooks,
      inject: [WiredSupervisorHooks],
    },
    RouteTablePortAdapter,
    PermissionDefinitionsPortAdapter,
    AddonLogReaderAdapter,
    AddonDataExportAdapter,
    AddonConfigReadAdapter,
    {
      provide: AddonRouteTablePort,
      useFactory: (a: RouteTablePortAdapter) => a,
      inject: [RouteTablePortAdapter],
    },
    {
      provide: PermissionDefinitionsPort,
      useFactory: (a: PermissionDefinitionsPortAdapter) => a,
      inject: [PermissionDefinitionsPortAdapter],
    },
    {
      provide: AddonLogReaderPort,
      useFactory: (a: AddonLogReaderAdapter) => a,
      inject: [AddonLogReaderAdapter],
    },
    {
      provide: AddonDataExportPort,
      useFactory: (a: AddonDataExportAdapter) => a,
      inject: [AddonDataExportAdapter],
    },
    {
      provide: AddonConfigReadPort,
      useFactory: (a: AddonConfigReadAdapter) => a,
      inject: [AddonConfigReadAdapter],
    },
  ],
  exports: [
    GrantPolicyPort,
    AddonAuditPort,
    AddonSourcePort,
    SupervisorHooks,
    ContributionRegistryPort,
    AddonDbAccess,
    AddonDbAccessAdapter,
    AddonSecrets,
    LogSink,
    AddonLogSinkAdapter,
    BindingsReader,
    TriggerFireSink,
    BridgeInboundSink,
    WorkerReportSink,
    AddonNotifyPort,
    AddonRpcPort,
    AddonDataPort,
    InboundEventPort,
    AddonRouteTablePort,
    PermissionDefinitionsPort,
    AddonLogReaderPort,
    AddonDataExportPort,
    AddonConfigReadPort,
    AddonAuditPort,
    SecretStorePort,
    ClockPort,
    MetricsPort,
    AccountsFacadePort,
    AddonPackageCatalogPort,
    OrgAddonRepositoryPort,
    BindingRepositoryPort,
    AddonTransportBindingRepositoryPort,
    TriggerInstanceRepositoryPort,
    JobStateRepositoryPort,
    InstanceSupervisorPort,
    AddonCallPort,
    RunDispatchPort,
    EventBusPort,
    AddonSecretService,
    TriggerFireService,
    WorkerDescriptorStore,
    WorkerFamilyModule,
    TriggerFamilyModule,
    AddonTriggerCatalogContributor,
    AddonRouteTable,
    TransportInboundService,
    TransportSessionDrafts,
    TransportSessionAsk,
    TransportSessionService,
    HookDeliveryService,
    ConfigNotifier,
    AddonConfigReadModel,
    FamilyModuleList,
    PermissionEngine,
    PermissionDefinitionRegistry,
    InstallPlanStore,
    PlanInstallUseCase,
    UploadInstallArchiveUseCase,
    ConfirmInstallUseCase,
    RescanPackagesUseCase,
    RemovePackageUseCase,
    PrunePackagesUseCase,
    EnableAddonUseCase,
    DisableAddonUseCase,
    UpdateAddonUseCase,
    RollbackAddonUseCase,
    UninstallAddonUseCase,
    SetGrantsUseCase,
    SetConfigUseCase,
    SetBindingsUseCase,
    AttachAddonCloudSourceUseCase,
    BrowseAddonCloudFolderUseCase,
    ListAddonCloudSourcesUseCase,
    PrepareAddonCloudSourceUseCase,
    RefreshAddonCloudSourceUseCase,
    AddonCloudMaterializer,
    ManageTriggerInstanceUseCase,
    FireTriggerUseCase,
    RunJobUseCase,
    AddonReconciler,
    AddonJobScheduler,
  ],
})
export class AddonWiringModule {}
