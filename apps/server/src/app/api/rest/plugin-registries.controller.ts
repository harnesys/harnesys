import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@harnesys/brix';
import type {
  AddPluginRegistryBody,
  ListPluginCatalogQuery,
  PluginCatalogEntry,
  PluginRegistrySummary,
} from '@harnesys/contracts';
import { AddPluginRegistryBodySchema, ListPluginCatalogQuerySchema } from '@harnesys/contracts';
import { AddPluginMarketplaceUseCase } from '../../application/plugins/add-plugin-marketplace.use-case.ts';
import { ListPluginCatalogUseCase } from '../../application/plugins/list-plugin-catalog.use-case.ts';
import { ListPluginMarketplacesUseCase } from '../../application/plugins/list-plugin-marketplaces.use-case.ts';
import { RemovePluginMarketplaceUseCase } from '../../application/plugins/remove-plugin-marketplace.use-case.ts';
import { SyncPluginMarketplaceUseCase } from '../../application/plugins/sync-plugin-marketplace.use-case.ts';

@Controller('plugin-registries')
export class PluginRegistriesController {
  constructor(
    private readonly listRegistries: ListPluginMarketplacesUseCase,
    private readonly addRegistry: AddPluginMarketplaceUseCase,
    private readonly syncRegistry: SyncPluginMarketplaceUseCase,
    private readonly removeRegistry: RemovePluginMarketplaceUseCase,
  ) {}

  @Get()
  list(): Promise<PluginRegistrySummary[]> {
    return this.listRegistries.execute();
  }

  @Post()
  @HttpCode(201)
  add(
    @Body(AddPluginRegistryBodySchema) body: AddPluginRegistryBody,
  ): Promise<PluginRegistrySummary> {
    return this.addRegistry.execute(body);
  }

  @Post(':id/refresh')
  refresh(@Param('id') id: string): Promise<PluginRegistrySummary> {
    return this.syncRegistry.execute(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.removeRegistry.execute(id);
  }
}

@Controller('plugin-catalog')
export class PluginCatalogController {
  constructor(private readonly listCatalog: ListPluginCatalogUseCase) {}

  @Get()
  catalog(
    @Query(ListPluginCatalogQuerySchema) query: ListPluginCatalogQuery,
  ): Promise<PluginCatalogEntry[]> {
    return this.listCatalog.execute(query);
  }
}
