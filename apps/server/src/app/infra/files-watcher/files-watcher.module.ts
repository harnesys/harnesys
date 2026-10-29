import { Module } from '@harnesys/brix';
import { FilesWatcherPort } from '../../domain/knowledge/files-watcher.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { SourceModule } from '../source/source.module.ts';
import { FilesWatcherAdapter } from './files-watcher.adapter.ts';

@Module({
  imports: [MachineHomeModule, SourceModule],
  providers: [{ provide: FilesWatcherPort, useClass: FilesWatcherAdapter }],
  exports: [FilesWatcherPort],
})
export class FilesWatcherModule {}
