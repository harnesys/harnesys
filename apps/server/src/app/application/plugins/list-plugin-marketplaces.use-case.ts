import { Injectable } from '@harnesys/brix';
import type { PluginRegistrySummary } from '@harnesys/contracts';
import { PluginRegistriesPort } from '../../domain/plugin/plugin-registries.port.ts';
import { EnsureDefaultPluginMarketplacesUseCase } from './ensure-default-plugin-marketplaces.use-case.ts';

@Injectable()
export class ListPluginMarketplacesUseCase {
  constructor(
    private readonly registries: PluginRegistriesPort,
    private readonly ensureDefault: EnsureDefaultPluginMarketplacesUseCase,
  ) {}

  async execute(): Promise<PluginRegistrySummary[]> {
    await this.ensureDefault.execute();
    return this.registries.list();
  }
}
