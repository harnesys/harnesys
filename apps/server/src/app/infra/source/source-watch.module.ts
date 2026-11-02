import { Module } from '@harnesys/brix';
import { MaterializationEventsPort } from '../../domain/source/materialization-events.port.ts';
import { GitSummaryEventsPort } from '../../domain/source/git-summary-events.port.ts';
import { SourceWatchEventsPort } from '../../domain/source/source-watch-events.port.ts';
import { SourceWatchGatePort } from '../../domain/source/source-watch-gate.port.ts';
import { FilesWatcherModule } from '../files-watcher/files-watcher.module.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { SourceUseCaseModule } from '../../application/source/source.use-case.module.ts';
import { SourceWatchBridge } from './files-watcher-source-bridge.ts';
import { SourceModule } from './source.module.ts';
import { SourceWatchEventsAdapter } from './source-watch-events.adapter.ts';
import { GitSummaryEventsAdapter } from './git-summary-events.adapter.ts';

@Module({
  imports: [FilesWatcherModule, MachineHomeModule, SourceModule, SourceUseCaseModule],
  providers: [
    { provide: SourceWatchEventsPort, useClass: SourceWatchEventsAdapter },
    { provide: SourceWatchGatePort, useClass: SourceWatchBridge },
    { provide: GitSummaryEventsPort, useClass: GitSummaryEventsAdapter },
  ],
  exports: [
    SourceWatchEventsPort,
    SourceWatchGatePort,
    MaterializationEventsPort,
    GitSummaryEventsPort,
  ],
})
export class SourceWatchModule {}
