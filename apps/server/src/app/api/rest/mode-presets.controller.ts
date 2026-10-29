import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@harnesys/brix';
import type {
  CreateModePresetBody,
  ListModePresetsResponse,
  ModePresetPublic,
  UpdateModePresetBody,
} from '@harnesys/contracts';
import { CreateModePresetBodySchema, UpdateModePresetBodySchema } from '@harnesys/contracts';
import { CreateModePresetUseCase } from '../../application/mode-presets/create-mode-preset.use-case.ts';
import { DeleteModePresetUseCase } from '../../application/mode-presets/delete-mode-preset.use-case.ts';
import { ListModePresetsUseCase } from '../../application/mode-presets/list-mode-presets.use-case.ts';
import { UpdateModePresetUseCase } from '../../application/mode-presets/update-mode-preset.use-case.ts';

@Controller('orgs/:orgId/mode-presets')
export class ModePresetsController {
  constructor(
    private readonly listPresets: ListModePresetsUseCase,
    private readonly createPreset: CreateModePresetUseCase,
    private readonly updatePreset: UpdateModePresetUseCase,
    private readonly deletePreset: DeleteModePresetUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): ListModePresetsResponse {
    return this.listPresets.execute({ orgId });
  }

  @Post()
  @HttpCode(201)
  create(
    @Param('orgId') orgId: string,
    @Body(CreateModePresetBodySchema) body: CreateModePresetBody,
  ): ModePresetPublic {
    return this.createPreset.execute({ orgId, body });
  }

  @Patch(':id')
  update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body(UpdateModePresetBodySchema) body: UpdateModePresetBody,
  ): ModePresetPublic {
    return this.updatePreset.execute({ orgId, id, body });
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('id') id: string): void {
    this.deletePreset.execute({ orgId, id });
  }
}
