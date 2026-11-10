import { Module } from '@harnesys/brix';
import { AddonCallPort } from '../../domain/addons/ports/addon-call.port.ts';
import { AddonCatalogModule } from '../../infra/addons/catalog/catalog.module.ts';
import { AddonSupervisorModule } from '../../infra/addons/supervisor/supervisor.module.ts';
import { AppsModule } from '../../infra/apps/apps.module.ts';
import { EventsModule } from '../../infra/events/events.module.ts';
import { SecretModule } from '../../infra/secret/secret.module.ts';
import { AppsUseCaseModule } from '../apps/apps.use-case.module.ts';
import { ThreadUseCaseModule } from '../threads/thread.use-case.module.ts';
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
import { AddonReconciler } from './reconcile/reconciler.ts';
import { RunDispatchPort } from './run-dispatch.port.ts';
import { ThreadRunDispatchService } from './run-dispatch.service.ts';
import { FireTriggerUseCase } from './triggers/fire-trigger.use-case.ts';
import { ManageTriggerInstanceUseCase } from './triggers/manage-instance.use-case.ts';
import { FireWindowTracker } from './triggers/trigger-limits.ts';

const useCases = [
  PlanInstallUseCase,
  ConfirmInstallUseCase,
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
];

const services = [
  InstallPlanStore,
  FireWindowTracker,
  AddonJobScheduler,
  AddonReconciler,
  ThreadRunDispatchService,
  AddonCallService,
];

@Module({
  imports: [
    ThreadUseCaseModule,
    AddonCatalogModule,
    AddonSupervisorModule,
    AppsModule,
    SecretModule,
    AppsUseCaseModule,
    EventsModule,
  ],
  providers: [
    ...useCases,
    ...services,
    { provide: RunDispatchPort, useClass: ThreadRunDispatchService },
    { provide: AddonCallPort, useClass: AddonCallService },
  ],
  exports: [...useCases, ...services, RunDispatchPort, AddonCallPort],
})
export class AddonsApplicationModule {}
