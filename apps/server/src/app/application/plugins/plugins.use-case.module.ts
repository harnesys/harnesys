import { Module } from '@harnesys/brix';
import { LspModule } from '../../infra/lsp/lsp.module.ts';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { PluginsModule } from '../../infra/plugins/plugins.module.ts';
import { RuntimeModule } from '../../infra/runtime/runtime.module.ts';
import { SecretModule } from '../../infra/secret/secret.module.ts';
import { AddPluginMarketplaceUseCase } from './add-plugin-marketplace.use-case.ts';
import { ApprovePluginServerUseCase } from './approve-plugin-server.use-case.ts';
import { EnsureDefaultPluginMarketplacesUseCase } from './ensure-default-plugin-marketplaces.use-case.ts';
import { InstallPluginUseCase } from './install-plugin.use-case.ts';
import { InvalidatePluginsUseCase } from './invalidate-plugins.use-case.ts';
import { ListPluginCatalogUseCase } from './list-plugin-catalog.use-case.ts';
import { ListPluginMarketplacesUseCase } from './list-plugin-marketplaces.use-case.ts';
import { ListPluginsUseCase } from './list-plugins.use-case.ts';
import { RemovePluginUseCase } from './remove-plugin.use-case.ts';
import { RemovePluginMarketplaceUseCase } from './remove-plugin-marketplace.use-case.ts';
import { SetPluginGrantsUseCase } from './set-plugin-grants.use-case.ts';
import { SetPluginOptionUseCase } from './set-plugin-option.use-case.ts';
import { SyncPluginMarketplaceUseCase } from './sync-plugin-marketplace.use-case.ts';
import { UpdatePluginUseCase } from './update-plugin.use-case.ts';

const useCases = [
  ListPluginsUseCase,
  InvalidatePluginsUseCase,
  InstallPluginUseCase,
  UpdatePluginUseCase,
  SetPluginGrantsUseCase,
  ApprovePluginServerUseCase,
  SetPluginOptionUseCase,
  RemovePluginUseCase,
  SyncPluginMarketplaceUseCase,
  AddPluginMarketplaceUseCase,
  RemovePluginMarketplaceUseCase,
  EnsureDefaultPluginMarketplacesUseCase,
  ListPluginMarketplacesUseCase,
  ListPluginCatalogUseCase,
];

@Module({
  imports: [PluginsModule, MachineHomeModule, RuntimeModule, SecretModule, LspModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class PluginsUseCaseModule {}
