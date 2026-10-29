import { Module } from '@harnesys/brix';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { ModePresetRegistryAdapter } from './mode-preset-registry.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [{ provide: ModePresetRegistryPort, useClass: ModePresetRegistryAdapter }],
  exports: [ModePresetRegistryPort],
})
export class ModePresetsModule {}
