import { Module } from '@harnesys/brix';
import { CreateModePresetUseCase } from './create-mode-preset.use-case.ts';
import { DeleteModePresetUseCase } from './delete-mode-preset.use-case.ts';
import { ListModePresetsUseCase } from './list-mode-presets.use-case.ts';
import { UpdateModePresetUseCase } from './update-mode-preset.use-case.ts';

const useCases = [
  ListModePresetsUseCase,
  CreateModePresetUseCase,
  UpdateModePresetUseCase,
  DeleteModePresetUseCase,
];

@Module({
  providers: [...useCases],
  exports: [...useCases],
})
export class ModePresetsUseCaseModule {}
