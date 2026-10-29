import { Injectable } from '@harnesys/brix';
import type { ListModePresetsResponse } from '@harnesys/contracts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import { toModePresetPublic } from './mode-preset.helpers.ts';

export interface ListModePresetsRequest {
  orgId: string;
}

@Injectable()
export class ListModePresetsUseCase {
  constructor(private readonly presets: ModePresetRegistryPort) {}

  execute(request: ListModePresetsRequest): ListModePresetsResponse {
    return {
      items: this.presets.list(request.orgId).map(toModePresetPublic),
    };
  }
}
