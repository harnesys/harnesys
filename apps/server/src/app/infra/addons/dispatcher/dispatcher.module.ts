import { Module } from '@harnesys/brix';
import { AddonsApplicationModule } from '../../../application/addons/addons-application.module.ts';
import { AppsUseCaseModule } from '../../../application/apps/apps.use-case.module.ts';
import { ThreadUseCaseModule } from '../../../application/threads/thread.use-case.module.ts';
import { HostServiceRegistryPort } from '../../../domain/addons/ports/host-service-registry.port.ts';
import { AppsModule } from '../../apps/apps.module.ts';
import { EventsModule } from '../../events/events.module.ts';
import { FleetHubModule } from '../../fleet-hub/fleet-hub.module.ts';
import { AddonCatalogModule } from '../catalog/catalog.module.ts';
import { AccountsHostService } from '../services/accounts/accounts-service.ts';
import { BridgeHostService } from '../services/bridge/bridge-service.ts';
import { ConfigHostService } from '../services/config/config-service.ts';
import { DbHostService } from '../services/db/db-service.ts';
import { EventsHostService } from '../services/events/events-service.ts';
import { AddonHttpFetchPort, SystemAddonFetch } from '../services/http/addon-fetch.port.ts';
import { HttpHostService } from '../services/http/http-service.ts';
import { HostServicesIndex } from '../services/index.ts';
import { LogHostService } from '../services/log/log-service.ts';
import { RunsHostService } from '../services/runs/runs-service.ts';
import { SecretsHostService } from '../services/secrets/secrets-service.ts';
import { TriggersHostService } from '../services/triggers/triggers-service.ts';
import { WorkersHostService } from '../services/workers/workers-service.ts';
import { AddonSupervisorModule } from '../supervisor/supervisor.module.ts';
import { HostDispatcher } from './host-dispatcher.ts';
import { InMemoryHostServiceRegistry } from './host-service-registry.adapter.ts';
import { InstanceRegistryGenerationAdapter } from './instance-generation.adapter.ts';
import { InstanceGenerationPort } from './instance-generation.port.ts';
import { PermissionDefinitionRegistry } from './permission-definitions.ts';
import { PermissionEngine } from './permission-engine.ts';
import { TokenBucketRateLimiter } from './rate-limit.ts';

@Module({
  imports: [
    AppsModule,
    FleetHubModule,
    EventsModule,
    ThreadUseCaseModule,
    AppsUseCaseModule,
    AddonsApplicationModule,
    AddonCatalogModule,
    AddonSupervisorModule,
  ],
  providers: [
    PermissionDefinitionRegistry,
    PermissionEngine,
    { provide: HostServiceRegistryPort, useClass: InMemoryHostServiceRegistry },
    { provide: InstanceGenerationPort, useClass: InstanceRegistryGenerationAdapter },
    { provide: AddonHttpFetchPort, useClass: SystemAddonFetch },
    TokenBucketRateLimiter,
    ConfigHostService,
    SecretsHostService,
    DbHostService,
    LogHostService,
    EventsHostService,
    HttpHostService,
    AccountsHostService,
    RunsHostService,
    TriggersHostService,
    BridgeHostService,
    WorkersHostService,
    HostServicesIndex,
    HostDispatcher,
  ],
  exports: [
    HostDispatcher,
    HostServiceRegistryPort,
    HostServicesIndex,
    PermissionDefinitionRegistry,
    PermissionEngine,
  ],
})
export class DispatcherModule {}
