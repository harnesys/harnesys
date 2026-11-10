import { Module } from '@harnesys/brix';
import { InstanceSupervisorPort } from '../../../domain/addons/ports/instance-supervisor.port.ts';
import { AppsModule } from '../../apps/apps.module.ts';
import { EventsModule } from '../../events/events.module.ts';
import { MachineHomeModule } from '../../machine-home/machine-home.module.ts';
import { AddonCatalogModule } from '../catalog/catalog.module.ts';
import { LauncherLinuxAdapter } from '../sandbox/launcher-linux.adapter.ts';
import { LauncherMacosAdapter } from '../sandbox/launcher-macos.adapter.ts';
import { LauncherNoneAdapter } from '../sandbox/launcher-none.adapter.ts';
import { SandboxLauncherPort } from '../sandbox/sandbox-launcher.port.ts';
import { SdkInProcessAddonLoader } from '../transport/sdk-in-process-loader.ts';
import { DefaultTransportFactory, TransportFactory } from '../transport/transport-factory.ts';
import { InstanceRegistry } from './instance-registry.ts';
import { AddonInstanceSupervisor } from './instance-supervisor.ts';
import { SupervisorSettings } from './supervisor.config.ts';
import { SupervisorTimers, SystemSupervisorTimers } from './supervisor-deps.ts';

function pickOsLauncher(
  macos: LauncherMacosAdapter,
  linux: LauncherLinuxAdapter,
  none: LauncherNoneAdapter,
): SandboxLauncherPort {
  if (process.platform === 'darwin' && macos.available()) {
    return macos;
  }
  if (process.platform === 'linux' && linux.available()) {
    return linux;
  }
  return none;
}

@Module({
  imports: [AppsModule, EventsModule, AddonCatalogModule, MachineHomeModule],
  providers: [
    InstanceRegistry,
    SdkInProcessAddonLoader,
    { provide: TransportFactory, useClass: DefaultTransportFactory },
    LauncherNoneAdapter,
    LauncherMacosAdapter,
    LauncherLinuxAdapter,
    {
      provide: SandboxLauncherPort,
      useFactory: (
        macos: LauncherMacosAdapter,
        linux: LauncherLinuxAdapter,
        none: LauncherNoneAdapter,
      ) => pickOsLauncher(macos, linux, none),
      inject: [LauncherMacosAdapter, LauncherLinuxAdapter, LauncherNoneAdapter],
    },
    { provide: SupervisorTimers, useClass: SystemSupervisorTimers },
    { provide: SupervisorSettings, useValue: new SupervisorSettings() },
    AddonInstanceSupervisor,
    {
      provide: InstanceSupervisorPort,
      useFactory: (supervisor: AddonInstanceSupervisor) => supervisor,
      inject: [AddonInstanceSupervisor],
    },
  ],
  exports: [
    InstanceSupervisorPort,
    AddonInstanceSupervisor,
    InstanceRegistry,
    TransportFactory,
    SandboxLauncherPort,
  ],
})
export class AddonSupervisorModule {}
