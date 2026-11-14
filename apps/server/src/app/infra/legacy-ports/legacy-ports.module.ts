import { Module } from '@harnesys/brix';
import { PluginRegistriesPort } from '../../domain/plugin/plugin-registries.port.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { PluginsModule } from '../plugins/plugins.module.ts';

/**
 * Global re-export of legacy infra ports. The legacy infra module
 * (plugins) is frozen by APPS_PLAN section 14.1 / ADDONS_PLAN section 16.1 and
 * cannot be marked global, while application modules must not import infra
 * modules (clean architecture gate). This module composes the legacy infra
 * module and re-exports its port tokens so application use-cases can inject
 * them without importing infra.
 */
@Module({
  global: true,
  imports: [PluginsModule],
  exports: [PluginRegistryPort, PluginRegistriesPort, PluginRuntimePort],
})
export class LegacyPortsModule {}
