import type { CatalogEntry, RegistryKind } from 'harnesys/plugins-catalog';

export interface PluginRegistryRecord {
  id: string;
  name: string;
  kind: RegistryKind;
  source: string;
  path: string;
  revision?: string;
  lastSyncAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export abstract class PluginRegistriesPort {
  abstract list(): PluginRegistryRecord[];
  abstract findById(id: string): PluginRegistryRecord | undefined;
  abstract findByName(name: string): PluginRegistryRecord | undefined;
  abstract upsert(rec: PluginRegistryRecord): PluginRegistryRecord;
  abstract delete(id: string): void;
  abstract replaceCatalog(registryId: string, entries: CatalogEntry[]): void;
  abstract listCatalog(filter?: { registryId?: string; q?: string }): CatalogEntry[];
  abstract findCatalogEntry(registryId: string, pluginName: string): CatalogEntry | undefined;
}
