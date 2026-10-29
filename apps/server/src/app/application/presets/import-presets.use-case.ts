import { Injectable } from '@harnesys/brix';
import type { CatalogItem, PresetEnvelope } from '@harnesys/contracts';
import {
  PresetConflictException,
  PresetValidationException,
} from '../../domain/presets/preset.error.ts';
import { PresetLibraryPort } from '../../domain/presets/preset-library.port.ts';
import { toCatalogItem } from '../../domain/presets/preset-view.ts';
import { duplicateEnvelopeIds } from '../../infra/presets/preset-envelope.ts';
import { ownerOf } from './preset-path.ts';
import { comparePresetVersions } from './preset-versioning.ts';
import { validateTeamBody } from './save-preset.use-case.ts';

export interface ImportPresetsRequest {
  envelope: PresetEnvelope;
}

const RESERVED_OWNER = 'harnesys';

@Injectable()
export class ImportPresetsUseCase {
  constructor(private readonly library: PresetLibraryPort) {}

  execute(request: ImportPresetsRequest): { items: CatalogItem[] } {
    const { envelope } = request;
    const duplicates = duplicateEnvelopeIds(envelope);
    if (duplicates.length > 0) {
      throw new PresetValidationException(
        `duplicate preset ids in envelope: ${duplicates.join(', ')}`,
        duplicates,
      );
    }
    this.assertImportable(envelope);
    const items: CatalogItem[] = [];
    for (const preset of envelope.presets) {
      const existing = this.library.findAnyById(preset.id);
      const record = this.library.save({
        id: preset.id,
        kind: preset.kind,
        origin: 'user',
        version: preset.version,
        name: preset.name,
        description: preset.description ?? null,
        author: existing?.author ?? manifestAuthor(envelope, preset.id),
        installedFrom: 'file',
        tags: preset.tags ?? [],
        body: preset.body,
      });
      items.push(toCatalogItem(record));
    }
    return { items };
  }

  private assertImportable(envelope: PresetEnvelope): void {
    for (const preset of envelope.presets) {
      if (ownerOf(preset.id) === RESERVED_OWNER) {
        throw new PresetValidationException(
          `the harnesys namespace is reserved for system presets: ${preset.id}`,
          { id: preset.id },
        );
      }
      const existing = this.library.findAnyById(preset.id);
      if (existing !== null && existing.kind !== preset.kind) {
        throw new PresetConflictException(`preset id is taken by another kind: ${preset.id}`, {
          id: preset.id,
        });
      }
      if (existing !== null && comparePresetVersions(existing.version, preset.version) > 0) {
        throw new PresetConflictException(
          `preset version is older than the stored one: ${preset.version} < ${existing.version}`,
          { id: preset.id, current: existing.version, incoming: preset.version },
        );
      }
      if (preset.kind === 'team') {
        validateTeamBody(preset.body, (ref) => this.agentExists(ref, envelope));
      }
    }
  }

  private agentExists(ref: string, envelope: PresetEnvelope): boolean {
    if (this.library.findById('agent', ref) !== null) {
      return true;
    }
    return envelope.presets.some((preset) => preset.kind === 'agent' && preset.id === ref);
  }
}

function manifestAuthor(envelope: PresetEnvelope, id: string): string | null {
  if (envelope.manifest.id !== id) {
    return null;
  }
  return envelope.manifest.author?.name ?? null;
}
