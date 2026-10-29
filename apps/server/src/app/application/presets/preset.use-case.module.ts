import { Module } from '@harnesys/brix';
import { PresetsModule } from '../../infra/presets/presets.module.ts';
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
  imports: [PresetsModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class PresetUseCaseModule {}
