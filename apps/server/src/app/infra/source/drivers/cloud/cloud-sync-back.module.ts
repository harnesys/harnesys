import { Module } from '@harnesys/brix';
import { CloudSyncBackPort } from '../../../../domain/source/cloud-sync-back.port.ts';
import { CloudSyncBackWatchPort } from '../../../../domain/source/cloud-sync-back-watch.port.ts';
import { FilesWatcherModule } from '../../../files-watcher/files-watcher.module.ts';
import { FleetHubModule } from '../../../fleet-hub/fleet-hub.module.ts';
import { IntegrationModule } from '../../../integration/integration.module.ts';
import { MachineHomeModule } from '../../../machine-home/machine-home.module.ts';
import { SecretModule } from '../../../secret/secret.module.ts';
import { SourceModule } from '../../source.module.ts';
import { CloudSyncBackAdapter } from './cloud-sync-back.adapter.ts';
import { CloudSyncBackWatcher } from './cloud-sync-back-watcher.ts';

@Module({
  global: true,
  imports: [
    FilesWatcherModule,
    FleetHubModule,
    IntegrationModule,
    MachineHomeModule,
    SecretModule,
    SourceModule,
  ],
  providers: [
    CloudSyncBackWatcher,
    { provide: CloudSyncBackPort, useClass: CloudSyncBackAdapter },
    {
      provide: CloudSyncBackWatchPort,
      useFactory: (watcher: CloudSyncBackWatcher) => watcher,
      inject: [CloudSyncBackWatcher],
    },
  ],
  exports: [CloudSyncBackWatcher, CloudSyncBackWatchPort, CloudSyncBackPort],
})
export class CloudSyncBackModule {}
