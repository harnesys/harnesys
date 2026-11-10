import type { MachineConfigPort } from '../machine/machine-config.port.ts';
import type { SourceLocationPort } from './source-location.port.ts';
import type { SourceRegistryPort } from './source-registry.port.ts';

export type CloudChangeKind = 'create' | 'change' | 'delete';

export interface SyncBackResult {
  status: 'uploaded' | 'keep-both' | 'revision-unknown' | 'folder-created' | 'deleted';
  localPath: string;
  remoteId?: string;
  conflictPath?: string;
  errorCode?: string;
}

export interface CloudSyncLocalDependencies {
  sources: SourceRegistryPort;
  sourceLocation: SourceLocationPort;
  machine: MachineConfigPort;
  getAccessToken: () => Promise<string>;
}

export interface CloudSyncFlushInput {
  orgId: string;
  source: {
    id: string;
    distribution: { kind: 'cloud-drive'; remoteFolderId: string; integrationId: string };
  };
  sourceLocation: SourceLocationPort;
  machine: MachineConfigPort;
  getAccessToken: () => Promise<string>;
}


export abstract class CloudSyncBackPort {
  abstract syncBackCloudFile(
    deps: CloudSyncLocalDependencies,
    orgId: string,
    sourceId: string,
    path: string,
  ): Promise<SyncBackResult | null>;

  abstract flushCloudMirror(input: CloudSyncFlushInput): Promise<SyncBackResult[]>;
}
