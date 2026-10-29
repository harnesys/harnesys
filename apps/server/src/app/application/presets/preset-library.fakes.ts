import type { CatalogItem, PresetDetail, PresetKind, PresetOrigin } from '@harnesys/contracts';
import { PresetConflictException } from '../../domain/presets/preset.error.ts';
import {
  type PresetCatalogFilter,
  PresetCatalogPort,
} from '../../domain/presets/preset-catalog.port.ts';
import {
  PresetLibraryPort,
  type PresetRecord,
  type PresetSaveInput,
} from '../../domain/presets/preset-library.port.ts';
import { toCatalogItem, toPresetDetail } from '../../domain/presets/preset-view.ts';

export class FakePresetStore extends PresetLibraryPort implements PresetCatalogPort {
  readonly records = new Map<string, PresetRecord>();

  list(filter?: PresetCatalogFilter): CatalogItem[] {
    return [...this.records.values()]
      .filter((record) => filter?.kind === undefined || record.kind === filter.kind)
      .filter((record) => filter?.origin === undefined || record.origin === filter.origin)
      .map(toCatalogItem);
  }

  get(kind: PresetKind, id: string): PresetDetail | null {
    const record = this.findById(kind, id);
    return record === null ? null : toPresetDetail(record);
  }

  findAnyById(id: string): PresetRecord | null {
    return this.records.get(id) ?? null;
  }

  findById(kind: PresetKind, id: string): PresetRecord | null {
    const record = this.records.get(id);
    if (record === undefined || record.kind !== kind) {
      return null;
    }
    return record;
  }

  save(input: PresetSaveInput): PresetRecord {
    const existing = this.records.get(input.id);
    if (existing !== undefined && existing.kind !== input.kind) {
      throw new PresetConflictException(`preset id is taken by another kind: ${input.id}`);
    }
    const now = new Date().toISOString();
    const record: PresetRecord = {
      id: input.id,
      kind: input.kind,
      origin: input.origin,
      version: input.version,
      name: input.name,
      description: input.description ?? null,
      body: input.body,
      author: input.author ?? null,
      installedFrom: input.installedFrom ?? null,
      tags: input.tags ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.records.set(record.id, record);
    return record;
  }

  delete(kind: PresetKind, id: string): void {
    const record = this.records.get(id);
    if (record !== undefined && record.kind === kind) {
      this.records.delete(id);
    }
  }

  listByOrigin(origin: PresetOrigin): PresetRecord[] {
    return [...this.records.values()].filter((record) => record.origin === origin);
  }

  deleteSystemRowsExcept(ids: string[]): void {
    for (const record of this.records.values()) {
      if (record.origin === 'system' && !ids.includes(record.id)) {
        this.records.delete(record.id);
      }
    }
  }
}
