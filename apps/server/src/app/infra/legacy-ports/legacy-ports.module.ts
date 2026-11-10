import { Module } from '@harnesys/brix';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { IntegrationTokenPort } from '../../domain/integration/integration-token.port.ts';
import { PluginRegistriesPort } from '../../domain/plugin/plugin-registries.port.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { ConnectorModule } from '../connector/connector.module.ts';
import { IntegrationModule } from '../integration/integration.module.ts';
import { PluginsModule } from '../plugins/plugins.module.ts';

/**
 * Global re-export of legacy infra ports. The legacy infra modules
 * (connector, integration, plugins) are frozen by APPS_PLAN section 14.1 /
 * ADDONS_PLAN section 16.1 and cannot be marked global, while application
 * modules must not import infra modules (clean architecture gate). This
 * module composes the legacy infra modules and re-exports their port tokens
 * so application use-cases can inject them without importing infra.
 */
@Module({
  global: true,
  imports: [ConnectorModule, IntegrationModule, PluginsModule],
  exports: [
    ConnectorRepositoryPort,
    IntegrationRegistryPort,
    IntegrationTokenPort,
    PluginRegistryPort,
    PluginRegistriesPort,
    PluginRuntimePort,
  ],
})
export class LegacyPortsModule {}
