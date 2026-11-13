import { Module } from '@harnesys/brix';
import { AddonCallPort } from '../../domain/addons/ports/addon-call.port.ts';
import { AppsUseCaseModule } from '../apps/apps.use-case.module.ts';
import { ThreadUseCaseModule } from '../threads/thread.use-case.module.ts';
import { BridgeInboundPort } from './bridge/bridge-inbound.port.ts';
import { NeutralBridgeInboundUseCase } from './bridge/neutral-bridge-inbound.use-case.ts';
import { AddonCallService } from './calls/addon-call.service.ts';
import { RunJobUseCase } from './jobs/run-job.use-case.ts';
import { AddonJobScheduler } from './jobs/schedule-jobs.service.ts';
import { DisableAddonUseCase } from './orgs/disable.use-case.ts';
import { EnableAddonUseCase } from './orgs/enable.use-case.ts';
import { RollbackAddonUseCase } from './orgs/rollback.use-case.ts';
import { SetBindingsUseCase } from './orgs/set-bindings.use-case.ts';
import { SetConfigUseCase } from './orgs/set-config.use-case.ts';
import { SetGrantsUseCase } from './orgs/set-grants.use-case.ts';
import { UninstallAddonUseCase } from './orgs/uninstall.use-case.ts';
import { UpdateAddonUseCase } from './orgs/update.use-case.ts';
import { ConfirmInstallUseCase } from './packages/confirm-install.use-case.ts';
import { PlanInstallUseCase } from './packages/plan-install.use-case.ts';
import { InstallPlanStore } from './packages/plan-store.ts';
import { PrunePackagesUseCase } from './packages/prune.use-case.ts';
import { RemovePackageUseCase } from './packages/remove-package.use-case.ts';
import { RescanPackagesUseCase } from './packages/rescan-packages.use-case.ts';
import { UploadInstallArchiveUseCase } from './packages/upload-install-archive.use-case.ts';
import { AddonReconciler } from './reconcile/reconciler.ts';
import { RunDispatchPort } from './run-dispatch.port.ts';
import { ThreadRunDispatchService } from './run-dispatch.service.ts';
import { AddonCloudMaterializer } from './sources/addon-cloud.materializer.ts';
import { AttachAddonCloudSourceUseCase } from './sources/attach-addon-cloud-source.use-case.ts';
import { BrowseAddonCloudFolderUseCase } from './sources/browse-addon-cloud-folder.use-case.ts';
import { ListAddonCloudSourcesUseCase } from './sources/list-addon-cloud-sources.use-case.ts';
import { PrepareAddonCloudSourceUseCase } from './sources/prepare-addon-cloud-source.use-case.ts';
import { RefreshAddonCloudSourceUseCase } from './sources/refresh-addon-cloud-source.use-case.ts';
import { FireTriggerUseCase } from './triggers/fire-trigger.use-case.ts';
import { ManageTriggerInstanceUseCase } from './triggers/manage-instance.use-case.ts';
import { FireWindowTracker } from './triggers/trigger-limits.ts';

const useCases = [
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
  ManageTriggerInstanceUseCase,
  FireTriggerUseCase,
  RunJobUseCase,
  NeutralBridgeInboundUseCase,
  AttachAddonCloudSourceUseCase,
  BrowseAddonCloudFolderUseCase,
  ListAddonCloudSourcesUseCase,
  PrepareAddonCloudSourceUseCase,
  RefreshAddonCloudSourceUseCase,
];

const services = [
  InstallPlanStore,
  FireWindowTracker,
  AddonJobScheduler,
  AddonReconciler,
  ThreadRunDispatchService,
  AddonCallService,
  AddonCloudMaterializer,
];

@Module({
  imports: [ThreadUseCaseModule, AppsUseCaseModule],
  providers: [
    ...useCases,
    ...services,
    { provide: RunDispatchPort, useClass: ThreadRunDispatchService },
    { provide: AddonCallPort, useClass: AddonCallService },
    { provide: BridgeInboundPort, useClass: NeutralBridgeInboundUseCase },
  ],
  exports: [...useCases, ...services, RunDispatchPort, AddonCallPort, BridgeInboundPort],
})
export class AddonsApplicationModule {}
