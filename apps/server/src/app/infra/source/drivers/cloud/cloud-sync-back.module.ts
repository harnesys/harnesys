import { Module } from '@harnesys/brix';
import { CloudSyncBackPort } from '../../../../domain/source/cloud-sync-back.port.ts';
import { CloudSyncBackAdapter } from './cloud-sync-back.adapter.ts';

@Module({
  global: true,
  providers: [{ provide: CloudSyncBackPort, useClass: CloudSyncBackAdapter }],
  exports: [CloudSyncBackPort],
})
export class CloudSyncBackModule {}
