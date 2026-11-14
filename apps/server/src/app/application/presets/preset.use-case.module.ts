import { Module } from '@harnesys/brix';
import { DeletePresetUseCase } from './delete-preset.use-case.ts';
import { ExportPresetUseCase } from './export-preset.use-case.ts';
import { GetPresetUseCase } from './get-preset.use-case.ts';
import { ImportPresetsUseCase } from './import-presets.use-case.ts';
import { ListPresetsUseCase } from './list-presets.use-case.ts';
import { SavePresetUseCase } from './save-preset.use-case.ts';

const useCases = [
  ListPresetsUseCase,
  GetPresetUseCase,
  SavePresetUseCase,
  DeletePresetUseCase,
  ExportPresetUseCase,
  ImportPresetsUseCase,
];

@Module({
  providers: [...useCases],
  exports: [...useCases],
})
export class PresetUseCaseModule {}
