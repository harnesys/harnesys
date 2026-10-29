import { Injectable } from '@harnesys/brix';
import {
  PresetImmutableException,
  PresetNotFoundException,
} from '../../domain/presets/preset.error.ts';
import { PresetLibraryPort } from '../../domain/presets/preset-library.port.ts';
import { type PresetPathInput, parsePresetPath } from './preset-path.ts';

@Injectable()
export class DeletePresetUseCase {
  constructor(private readonly library: PresetLibraryPort) {}

  execute(input: PresetPathInput): void {
    const path = parsePresetPath(input);
    const record = this.library.findById(path.kind, path.id);
    if (record === null) {
      throw new PresetNotFoundException(path.id);
    }
    if (record.origin === 'system') {
      throw new PresetImmutableException(`system presets are immutable: ${path.id}`, {
        id: path.id,
      });
    }
    this.library.delete(path.kind, path.id);
  }
}
