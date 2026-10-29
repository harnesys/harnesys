import { Injectable } from '@harnesys/brix';
import type { AddPluginRegistryBody, PluginRegistrySummary } from '@harnesys/contracts';
import type { RegistryKind } from 'harnesys/plugins-catalog';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginValidationException } from '../../domain/plugin/plugin.error.ts';
import { PluginRegistriesPort } from '../../domain/plugin/plugin-registries.port.ts';
import { removePluginPath, slugFromSource } from '../../infra/plugins/plugin-git.ts';
import { SyncPluginMarketplaceUseCase } from './sync-plugin-marketplace.use-case.ts';

@Injectable()
export class AddPluginMarketplaceUseCase {
  constructor(
    private readonly registries: PluginRegistriesPort,
    private readonly layout: HostFsLayoutPort,
    private readonly sync: SyncPluginMarketplaceUseCase,
  ) {}

  async execute(body: AddPluginRegistryBody): Promise<PluginRegistrySummary> {
    const source = body.source.trim();
    if (source.length === 0) {
      throw new PluginValidationException('source is required');
    }
    const kind: RegistryKind = body.kind ?? 'claude-marketplace';
    const id = slugFromSource(source);
    if (this.registries.findById(id) || this.registries.findByName(id)) {
      throw new PluginValidationException(`registry already exists: ${id}`);
    }
    this.layout.ensureMarketplacesDir();
    const path = this.layout.marketplaceInstallPath(id);
    const now = new Date().toISOString();
    const record = this.registries.upsert({
      id,
      name: id,
      kind,
      source,
      path,
      createdAt: now,
      updatedAt: now,
    });
    try {
      return await this.sync.execute(record.id);
    } catch (err) {
      this.registries.delete(record.id);
      await removePluginPath(path).catch(() => undefined);
      throw err;
    }
  }
}
