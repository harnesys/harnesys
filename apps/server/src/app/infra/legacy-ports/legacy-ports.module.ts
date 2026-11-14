import { Module } from '@harnesys/brix';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { IntegrationTokenPort } from '../../domain/integration/integration-token.port.ts';
import { PluginRegistriesPort } from '../../domain/plugin/plugin-registries.port.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { IntegrationModule } from '../integration/integration.module.ts';
import { PluginsModule } from '../plugins/plugins.module.ts';

/**
 * Global re-export of legacy infra ports. The legacy infra modules
 * (integration, plugins) are frozen by APPS_PLAN section 14.1 /
 * ADDONS_PLAN section 16.1 and cannot be marked global, while application
 * modules must not import infra modules (clean architecture gate). This
 * module composes the legacy infra modules and re-exports their port tokens
 * so application use-cases can inject them without importing infra.
 */
@Module({
  global: true,
  imports: [IntegrationModule, PluginsModule],
  exports: [
    IntegrationRegistryPort,
    IntegrationTokenPort,
    PluginRegistryPort,
    PluginRegistriesPort,
    PluginRuntimePort,
  ],
})
export class LegacyPortsModule {}
