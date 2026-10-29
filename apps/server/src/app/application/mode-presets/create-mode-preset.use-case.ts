import { Injectable } from '@harnesys/brix';
import type { CreateModePresetBody, ModePresetPublic } from '@harnesys/contracts';
import { ModePresetConflictException } from '../../domain/mode-presets/mode-preset.error.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import { toModePresetPublic } from './mode-preset.helpers.ts';

export interface CreateModePresetRequest {
  orgId: string;
  body: CreateModePresetBody;
}

@Injectable()
export class CreateModePresetUseCase {
  constructor(private readonly presets: ModePresetRegistryPort) {}

  execute(request: CreateModePresetRequest): ModePresetPublic {
    if (this.presets.findById(request.orgId, request.body.id)) {
      throw new ModePresetConflictException('mode preset id taken');
    }
    const now = new Date().toISOString();
    const body = request.body;
    return toModePresetPublic(
      this.presets.insert({
        orgId: request.orgId,
        id: body.id,
        name: body.name,
        description: body.description ?? '',
        instructions: body.instructions ?? '',
        skills: body.skills ?? [],
        packs: body.packs ?? {},
        ...(body.disabledTools !== undefined ? { disabledTools: body.disabledTools } : {}),
        ...(body.exposure !== undefined ? { exposure: body.exposure } : {}),
        permissions: body.permissions ?? {},
        builtin: false,
        installedByDefault: body.installedByDefault ?? false,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
}
