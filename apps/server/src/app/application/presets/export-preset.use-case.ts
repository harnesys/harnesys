import { Injectable } from '@harnesys/brix';
import type { PresetEnvelope } from '@harnesys/contracts';
import { PresetNotFoundException } from '../../domain/presets/preset.error.ts';
import { PresetLibraryPort } from '../../domain/presets/preset-library.port.ts';
import { buildEnvelope, resolveEmbeds } from '../../infra/presets/preset-envelope.ts';
import { type PresetPathInput, parsePresetPath } from './preset-path.ts';

@Injectable()
export class ExportPresetUseCase {
  constructor(private readonly library: PresetLibraryPort) {}

  execute(input: PresetPathInput): PresetEnvelope {
    const path = parsePresetPath(input);
    const record = this.library.findById(path.kind, path.id);
    if (record === null) {
      throw new PresetNotFoundException(path.id);
    }
    const embeds = resolveEmbeds(record, (ref) => this.library.findById('agent', ref));
    return buildEnvelope(record, embeds);
  }
}
