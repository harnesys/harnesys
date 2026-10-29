import { Module } from '@harnesys/brix';
import { PluginRegistriesPort } from '../../domain/plugin/plugin-registries.port.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { ProviderModule } from '../provider/provider.module.ts';
import { SecretModule } from '../secret/secret.module.ts';
import { SkillsTierModule } from '../skills/skills-tier.module.ts';
import { PluginMarketplacesAdapter } from './plugin-marketplaces.adapter.ts';
import { PluginRegistryAdapter } from './plugin-registry.adapter.ts';
import { PluginRuntimeAdapter } from './plugin-runtime.adapter.ts';

@Module({
  imports: [MachineHomeModule, ProviderModule, SecretModule, SkillsTierModule],
  providers: [
    { provide: PluginRegistryPort, useClass: PluginRegistryAdapter },
    { provide: PluginRegistriesPort, useClass: PluginMarketplacesAdapter },
    { provide: PluginRuntimePort, useClass: PluginRuntimeAdapter },
  ],
  exports: [PluginRegistryPort, PluginRegistriesPort, PluginRuntimePort],
})
export class PluginsModule {}
