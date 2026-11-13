import { Module } from '@harnesys/brix';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { BindingRepositoryPort } from '../../../domain/addons/ports/binding-repository.port.ts';
import { JobStateRepositoryPort } from '../../../domain/addons/ports/job-state-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { AddonTransportBindingRepositoryPort } from '../../../domain/addons/ports/transport-binding-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { MachineHomeModule } from '../../machine-home/machine-home.module.ts';
import { AddonBindingRepositoryAdapter } from '../../org-sqlite/addon-binding-repository.adapter.ts';
import { AddonJobStateRepositoryAdapter } from '../../org-sqlite/addon-job-state-repository.adapter.ts';
import { AddonTransportBindingRepositoryAdapter } from '../../org-sqlite/addon-transport-binding-repository.adapter.ts';
import { AddonTriggerInstanceRepositoryAdapter } from '../../org-sqlite/addon-trigger-instance-repository.adapter.ts';
import { OrgAddonRepositoryAdapter } from '../../org-sqlite/org-addon-repository.adapter.ts';
import { AddonPackagePruner } from './addon-package-pruner.ts';
import { AddonPackageStoreAdapter } from './addon-package-store.adapter.ts';
import { BuiltinAddonSourceAdapter } from './addon-staging.ts';
import { ArchiveAddonSourceAdapter } from './archive-source.adapter.ts';
import { ExternalAddonSourceAdapter } from './external-source.adapter.ts';
import { LocalAddonSourceAdapter } from './local-source.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [
    { provide: OrgAddonRepositoryPort, useClass: OrgAddonRepositoryAdapter },
    { provide: BindingRepositoryPort, useClass: AddonBindingRepositoryAdapter },
    {
      provide: AddonTransportBindingRepositoryPort,
      useClass: AddonTransportBindingRepositoryAdapter,
    },
    { provide: TriggerInstanceRepositoryPort, useClass: AddonTriggerInstanceRepositoryAdapter },
    { provide: JobStateRepositoryPort, useClass: AddonJobStateRepositoryAdapter },
    { provide: AddonPackageCatalogPort, useClass: AddonPackageStoreAdapter },
    BuiltinAddonSourceAdapter,
    LocalAddonSourceAdapter,
    ExternalAddonSourceAdapter,
    ArchiveAddonSourceAdapter,
    AddonPackagePruner,
  ],
  exports: [
    OrgAddonRepositoryPort,
    BindingRepositoryPort,
    AddonTransportBindingRepositoryPort,
    TriggerInstanceRepositoryPort,
    JobStateRepositoryPort,
    AddonPackageCatalogPort,
    BuiltinAddonSourceAdapter,
    LocalAddonSourceAdapter,
    ExternalAddonSourceAdapter,
    ArchiveAddonSourceAdapter,
    AddonPackagePruner,
  ],
})
export class AddonCatalogModule {}
