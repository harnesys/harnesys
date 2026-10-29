import { Injectable } from '@harnesys/brix';
import type { ListPluginCatalogQuery, PluginCatalogEntry } from '@harnesys/contracts';
import { PluginRegistriesPort } from '../../domain/plugin/plugin-registries.port.ts';
import { EnsureDefaultPluginMarketplacesUseCase } from './ensure-default-plugin-marketplaces.use-case.ts';

@Injectable()
export class ListPluginCatalogUseCase {
  constructor(
    private readonly registries: PluginRegistriesPort,
    private readonly ensureDefault: EnsureDefaultPluginMarketplacesUseCase,
  ) {}

  async execute(filter: ListPluginCatalogQuery = {}): Promise<PluginCatalogEntry[]> {
    await this.ensureDefault.execute();
    return this.registries.listCatalog({
      ...(filter.q ? { q: filter.q } : {}),
      ...(filter.registryId ? { registryId: filter.registryId } : {}),
    });
  }
}
