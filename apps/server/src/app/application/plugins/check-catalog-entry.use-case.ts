import { Injectable } from '@harnesys/brix';
import type { PluginCatalogEntry } from '@harnesys/contracts';
import { loadPluginIrFromDirectory } from 'harnesys/adapters/node';
import type { CatalogEntry } from 'harnesys/plugins-catalog';
import { collectComponentKinds, summarizePluginCompat } from 'harnesys/plugins-catalog';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginNotFoundException } from '../../domain/plugin/plugin.error.ts';
import { PluginRegistriesPort } from '../../domain/plugin/plugin-registries.port.ts';
import { stageInstallSource } from '../../infra/plugins/install-sources.ts';

export interface CheckCatalogEntryParams {
  orgId: string;
  registryId: string;
  pluginName: string;
}

@Injectable()
export class CheckCatalogEntryUseCase {
  constructor(
    private readonly registries: PluginRegistriesPort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(params: CheckCatalogEntryParams): Promise<PluginCatalogEntry> {
    const { orgId, registryId, pluginName } = params;
    const entry = this.registries.findCatalogEntry(registryId, pluginName);
    if (entry === undefined) {
      throw new PluginNotFoundException(pluginName);
    }
    if (entry.compat !== undefined) {
      return entry;
    }
    const staged = await stageInstallSource(
      { registryId, pluginName },
      this.registries,
      this.layout,
      orgId,
    );
    try {
      const loaded = await loadPluginIrFromDirectory({ root: staged.dir, pluginData: staged.dir });
      const patched: CatalogEntry = {
        ...entry,
        format: loaded.ir.sourceFormat,
        compat: summarizePluginCompat(loaded.ir, loaded.diagnostics),
        inertComponents: collectComponentKinds(loaded.ir, 'inert'),
        droppedComponents: collectComponentKinds(loaded.ir, 'dropped'),
      };
      const all = this.registries.listCatalog({ registryId });
      this.registries.replaceCatalog(
        registryId,
        all.map((item) => (item.pluginName === pluginName ? patched : item)),
      );
      return patched;
    } finally {
      await staged.cleanup?.();
    }
  }
}
