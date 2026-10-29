import { Injectable } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginRegistriesPort } from '../../domain/plugin/plugin-registries.port.ts';
import { slugFromSource } from '../../infra/plugins/plugin-git.ts';

export const DEFAULT_PLUGIN_REGISTRY_SOURCE = 'anthropics/claude-plugins-official';

@Injectable()
export class EnsureDefaultPluginMarketplacesUseCase {
  constructor(
    private readonly registries: PluginRegistriesPort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(): Promise<void> {
    if (this.registries.list().length > 0) {
      return;
    }
    const id = slugFromSource(DEFAULT_PLUGIN_REGISTRY_SOURCE);
    if (this.registries.findById(id)) {
      return;
    }
    const now = new Date().toISOString();
    this.registries.upsert({
      id,
      name: id,
      kind: 'claude-marketplace',
      source: DEFAULT_PLUGIN_REGISTRY_SOURCE,
      path: this.layout.marketplaceInstallPath(id),
      createdAt: now,
      updatedAt: now,
    });
  }
}
