import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadPluginIrFromDirectory } from 'harnesys/adapters/node';
import type { CatalogEntry } from 'harnesys/plugins-catalog';
import { collectComponentKinds, summarizePluginCompat } from 'harnesys/plugins-catalog';

type UnscopedCatalogEntry = Omit<CatalogEntry, 'registryId'>;

export async function enrichCatalogEntries(
  entries: UnscopedCatalogEntry[],
  registryPath: string,
): Promise<UnscopedCatalogEntry[]> {
  const enriched: UnscopedCatalogEntry[] = [];
  for (const entry of entries) {
    if (entry.installSource?.type === 'relative') {
      const dir = join(registryPath, entry.installSource.path);
      enriched.push(await enrichCatalogEntryFromDir(entry, dir));
    } else {
      enriched.push(entry);
    }
  }
  return enriched;
}

export async function enrichCatalogEntryFromDir(
  entry: UnscopedCatalogEntry,
  dir: string,
): Promise<UnscopedCatalogEntry> {
  if (!existsSync(join(dir, '.claude-plugin')) && !existsSync(join(dir, 'plugin.json'))) {
    return entry;
  }
  try {
    const loaded = await loadPluginIrFromDirectory({
      root: dir,
      pluginData: join(dir, '.catalog-data'),
    });
    return {
      ...entry,
      format: loaded.ir.sourceFormat,
      compat: summarizePluginCompat(loaded.ir, loaded.diagnostics),
      inertComponents: collectComponentKinds(loaded.ir, 'inert'),
      droppedComponents: collectComponentKinds(loaded.ir, 'dropped'),
    };
  } catch {
    return entry;
  }
}
