import { Injectable } from '@harnesys/brix';
import { PluginRegistryNotFoundException } from '../../domain/plugin/plugin.error.ts';
import { PluginRegistriesPort } from '../../domain/plugin/plugin-registries.port.ts';
import { removePluginPath } from '../../infra/plugins/plugin-git.ts';

@Injectable()
export class RemovePluginMarketplaceUseCase {
  constructor(private readonly registries: PluginRegistriesPort) {}

  async execute(registryId: string): Promise<void> {
    const current = this.registries.findById(registryId);
    if (!current) {
      throw new PluginRegistryNotFoundException(registryId);
    }
    this.registries.delete(registryId);
    await removePluginPath(current.path).catch(() => undefined);
  }
}
