import { Module } from '@harnesys/brix';
import { PresetCatalogPort } from '../../domain/presets/preset-catalog.port.ts';
import { PresetLibraryPort } from '../../domain/presets/preset-library.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { PresetRepositoryAdapter } from './preset-repository.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [
    { provide: PresetRepositoryAdapter, useClass: PresetRepositoryAdapter },
    {
      provide: PresetCatalogPort,
      useFactory: (adapter: PresetRepositoryAdapter): PresetCatalogPort => adapter,
      inject: [PresetRepositoryAdapter],
    },
    {
      provide: PresetLibraryPort,
      useFactory: (adapter: PresetRepositoryAdapter): PresetLibraryPort => adapter,
      inject: [PresetRepositoryAdapter],
    },
  ],
  exports: [PresetCatalogPort, PresetLibraryPort],
})
export class PresetsModule {}
