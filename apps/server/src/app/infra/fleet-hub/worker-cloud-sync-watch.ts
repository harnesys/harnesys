import { Injectable } from '@harnesys/brix';
import { OrgExecutionReplicaPort } from '../../domain/fleet/org-execution-replica.port.ts';
import { CloudSyncBackWatcher } from '../source/drivers/cloud/cloud-sync-back-watcher.ts';
import { resolveWorkerCloudCredential } from './worker-cloud-sync.ts';
import type { DialerSession } from './worker-dialer.session.ts';

@Injectable()
export class WorkerCloudSyncWatch {
  constructor(
    private readonly replica: OrgExecutionReplicaPort,
    private readonly watcher: CloudSyncBackWatcher,
  ) {}

  sync(session: DialerSession, reconcile: boolean): void {
    const snapshot = this.replica.get(session.identity.orgId);
    if (!snapshot) {
      return;
    }
    const cloudSources = snapshot.sources.flatMap((source) => {
      if (source.distribution.kind !== 'cloud-drive') {
        return [];
      }
      return [
        {
          id: source.id,
          distribution: {
            kind: 'cloud-drive' as const,
            remoteFolderId: source.distribution.remoteFolderId,
            integrationId: source.distribution.integrationId,
          },
        },
      ];
    });
    this.watcher.syncSources(session.identity.orgId, cloudSources, {
      resolveCredential: (source) => resolveWorkerCloudCredential(session, source),
      onSync: (frame, sourceChanged) => {
        try {
          session.socket?.send(
            JSON.stringify({
              kind: 'SOURCE_MATERIALIZATION',
              ...frame,
              sourceChanged,
            }),
          );
        } catch {
          // ignore
        }
      },
      reconcile,
    });
  }

  stop(orgId: string): void {
    this.watcher.stopOrg(orgId);
  }
}
