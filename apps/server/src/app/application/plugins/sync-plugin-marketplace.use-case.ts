import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { findMarketplaceManifest, parseClaudeMarketplace } from 'harnesys/plugins-catalog';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  PluginRegistryNotFoundException,
  PluginValidationException,
} from '../../domain/plugin/plugin.error.ts';
import {
  PluginRegistriesPort,
  type PluginRegistryRecord,
} from '../../domain/plugin/plugin-registries.port.ts';
import {
  clonePlugin,
  isMarketplaceJsonUrl,
  removePluginPath,
  resolveGitSource,
  updatePluginCheckout,
} from '../../infra/plugins/plugin-git.ts';

@Injectable()
export class SyncPluginMarketplaceUseCase {
  constructor(
    private readonly registries: PluginRegistriesPort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(registryId: string): Promise<PluginRegistryRecord> {
    const current = this.registries.findById(registryId);
    if (!current) {
      throw new PluginRegistryNotFoundException(registryId);
    }
    try {
      const synced = await syncCheckout(current, this.layout);
      const location = findMarketplaceManifest(synced.path);
      if (!location) {
        throw new PluginValidationException(
          'marketplace.json not found (.claude-plugin/marketplace.json or marketplace.json)',
        );
      }
      const rawText = await Bun.file(location.manifestPath).text();
      const parsed = parseClaudeMarketplace(JSON.parse(rawText) as unknown, {
        rootHint: location.root,
      });
      const entries = parsed.entries.map((entry) => ({
        ...entry,
        registryId: current.id,
      }));
      this.registries.replaceCatalog(current.id, entries);
      const now = new Date().toISOString();
      return this.registries.upsert({
        ...current,
        name: parsed.name || current.name,
        path: synced.path,
        ...(synced.revision ? { revision: synced.revision } : {}),
        lastSyncAt: now,
        lastError: undefined,
        updatedAt: now,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const now = new Date().toISOString();
      this.registries.upsert({
        ...current,
        lastError: message,
        updatedAt: now,
      });
      throw err;
    }
  }
}

async function syncCheckout(
  registry: PluginRegistryRecord,
  layout: HostFsLayoutPort,
): Promise<{ path: string; revision?: string }> {
  const dest = registry.path || layout.marketplaceInstallPath(registry.id);
  if (isMarketplaceJsonUrl(registry.source)) {
    await mkdir(dirname(join(dest, 'marketplace.json')), { recursive: true });
    const response = await fetch(registry.source);
    if (!response.ok) {
      throw new Error(`failed to download marketplace.json (${response.status})`);
    }
    const text = await response.text();
    await writeFile(join(dest, 'marketplace.json'), text, 'utf8');
    return { path: dest };
  }
  const resolved = resolveGitSource(registry.source);
  if (existsSync(join(dest, '.git'))) {
    const updated = await updatePluginCheckout({ path: dest });
    return { path: dest, revision: updated.revision };
  }
  if (existsSync(dest)) {
    await removePluginPath(dest);
  }
  layout.ensureMarketplacesDir();
  const cloned = await clonePlugin({ source: resolved, dest });
  return { path: dest, revision: cloned.revision };
}
