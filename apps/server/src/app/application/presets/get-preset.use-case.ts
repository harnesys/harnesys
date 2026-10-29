import { Injectable } from '@harnesys/brix';
import type { PresetDetail } from '@harnesys/contracts';
import { PresetNotFoundException } from '../../domain/presets/preset.error.ts';
import { PresetCatalogPort } from '../../domain/presets/preset-catalog.port.ts';
import { type PresetPathInput, parsePresetPath } from './preset-path.ts';

@Injectable()
export class GetPresetUseCase {
  constructor(private readonly catalog: PresetCatalogPort) {}

  execute(input: PresetPathInput): PresetDetail {
    const path = parsePresetPath(input);
    const detail = this.catalog.get(path.kind, path.id);
    if (detail === null) {
      throw new PresetNotFoundException(path.id);
    }
    return detail;
  }
}
