import { Injectable } from '@harnesys/brix';
import type { ModePresetPublic, UpdateModePresetBody } from '@harnesys/contracts';
import {
  ModePresetConflictException,
  ModePresetNotFoundException,
} from '../../domain/mode-presets/mode-preset.error.ts';
import type { ModePresetPatch } from '../../domain/mode-presets/mode-preset.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import { toModePresetPublic } from './mode-preset.helpers.ts';

export interface UpdateModePresetRequest {
  orgId: string;
  id: string;
  body: UpdateModePresetBody;
}

@Injectable()
export class UpdateModePresetUseCase {
  constructor(private readonly presets: ModePresetRegistryPort) {}

  execute(request: UpdateModePresetRequest): ModePresetPublic {
    const current = this.presets.findById(request.orgId, request.id);
    if (!current) {
      throw new ModePresetNotFoundException(request.id);
    }
    const body = request.body;
    const hasContentEdits =
      body.name !== undefined ||
      body.description !== undefined ||
      body.instructions !== undefined ||
      body.skills !== undefined ||
      body.packs !== undefined ||
      body.disabledTools !== undefined ||
      body.exposure !== undefined ||
      body.permissions !== undefined;
    if (current.builtin && hasContentEdits) {
      throw new ModePresetConflictException(
        'builtin mode preset: only installedByDefault can change',
      );
    }
    const patch: ModePresetPatch = { updatedAt: new Date().toISOString() };
    if (body.name !== undefined) {
      patch.name = body.name;
    }
    if (body.description !== undefined) {
      patch.description = body.description;
    }
    if (body.instructions !== undefined) {
      patch.instructions = body.instructions;
    }
    if (body.skills !== undefined) {
      patch.skills = body.skills;
    }
    if (body.packs !== undefined) {
      patch.packs = body.packs;
    }
    if (body.disabledTools !== undefined) {
      patch.disabledTools = body.disabledTools;
    }
    if (body.exposure !== undefined) {
      patch.exposure = body.exposure;
    }
    if (body.permissions !== undefined) {
      patch.permissions = body.permissions;
    }
    if (body.installedByDefault !== undefined) {
      patch.installedByDefault = body.installedByDefault;
    }
    return toModePresetPublic(this.presets.update(request.orgId, request.id, patch));
  }
}
