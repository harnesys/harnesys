import { Injectable } from '@harnesys/brix';
import type {
  CloudSyncFlushInput,
  CloudSyncLocalDependencies,
  SyncBackResult,
} from '../../../../domain/source/cloud-sync-back.port.ts';
import { CloudSyncBackPort } from '../../../../domain/source/cloud-sync-back.port.ts';
import { flushCloudMirror, syncBackCloudFile } from './cloud-sync-back.ts';

@Injectable()
export class CloudSyncBackAdapter extends CloudSyncBackPort {
  override syncBackCloudFile(
    deps: CloudSyncLocalDependencies,
    orgId: string,
    sourceId: string,
    path: string,
  ): Promise<SyncBackResult | null> {
    return syncBackCloudFile(deps, orgId, sourceId, path);
  }

  override flushCloudMirror(input: CloudSyncFlushInput): Promise<SyncBackResult[]> {
    return flushCloudMirror(input);
  }
}
