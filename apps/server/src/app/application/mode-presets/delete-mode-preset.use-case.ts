import { Injectable } from '@harnesys/brix';
import {
  ModePresetConflictException,
  ModePresetNotFoundException,
} from '../../domain/mode-presets/mode-preset.error.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';

export interface DeleteModePresetRequest {
  orgId: string;
  id: string;
}

@Injectable()
export class DeleteModePresetUseCase {
  constructor(private readonly presets: ModePresetRegistryPort) {}

  execute(request: DeleteModePresetRequest): void {
    const current = this.presets.findById(request.orgId, request.id);
    if (!current) {
      throw new ModePresetNotFoundException(request.id);
    }
    if (current.builtin) {
      throw new ModePresetConflictException('builtin mode preset cannot be deleted');
    }
    this.presets.delete(request.orgId, request.id);
  }
}
