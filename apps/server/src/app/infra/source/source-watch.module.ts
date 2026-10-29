import { Module } from '@harnesys/brix';
import { MaterializationEventsPort } from '../../domain/source/materialization-events.port.ts';
import { SourceWatchEventsPort } from '../../domain/source/source-watch-events.port.ts';
import { SourceWatchGatePort } from '../../domain/source/source-watch-gate.port.ts';
import { FilesWatcherModule } from '../files-watcher/files-watcher.module.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { SourceWatchBridge } from './files-watcher-source-bridge.ts';
import { SourceModule } from './source.module.ts';
import { SourceWatchEventsAdapter } from './source-watch-events.adapter.ts';

@Module({
  imports: [FilesWatcherModule, MachineHomeModule, SourceModule],
  providers: [
    { provide: SourceWatchEventsPort, useClass: SourceWatchEventsAdapter },
    { provide: SourceWatchGatePort, useClass: SourceWatchBridge },
  ],
  exports: [SourceWatchEventsPort, SourceWatchGatePort, MaterializationEventsPort],
})
export class SourceWatchModule {}
