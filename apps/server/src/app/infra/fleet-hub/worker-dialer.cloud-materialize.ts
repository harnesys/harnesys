import { materializeCloudSourceOnHost } from '../../application/source/materialize-cloud-source.ts';
import type { OrgExecutionReplicaPort } from '../../domain/fleet/org-execution-replica.port.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import type { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import type { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import {
  getValidGoogleAccessToken,
  googleCredKey,
  loadGoogleOAuthClient,
} from '../integration/google/google-token-access.ts';
import { resolveFleetSecretByOperation } from './fleet-secret-resolver.ts';
import type { DialerSession } from './worker-dialer.session.ts';

export interface WorkerCloudMaterializeDeps {
  replica: OrgExecutionReplicaPort;
  layout: HostFsLayoutPort;
  machineConfig: MachineConfigPort;
  materializations: SourceMaterializationPort;
  secrets: SecretStorePort;
}

interface SourceCommand {
  operationId: string;
  sourceId: string;
  sourceRevision: number;
  projectionRevision: number;
  secretName?: string;
}

export async function runCloudSourceMaterialize(
  deps: WorkerCloudMaterializeDeps,
  session: DialerSession,
  command: SourceCommand,
  force: boolean,
  emit: (frame: {
    sourceId: string;
    hostId: string;
    revision: number;
    state: 'absent' | 'materializing' | 'ready' | 'failed';
    lastErrorCode?: string;
    lastConflictPaths?: string[];
    refreshRequired?: boolean;
  }) => void,
): Promise<void> {
  const snapshot = deps.replica.get(session.identity.orgId);
  const accepted = deps.replica.acceptedRevision(session.identity.orgId);
  const hostId = deps.machineConfig.get().id;
  const failRevision = command.projectionRevision + 1;
  if (!snapshot || accepted === null || accepted < command.sourceRevision) {
    emit({
      sourceId: command.sourceId,
      hostId,
      revision: failRevision,
      state: 'failed',
      lastErrorCode: 'SOURCE_REVISION_MISMATCH',
    });
    return;
  }
  const source = snapshot.sources.find((item) => item.id === command.sourceId);
  if (source?.distribution.kind !== 'cloud-drive') {
    emit({
      sourceId: command.sourceId,
      hostId,
      revision: failRevision,
      state: 'failed',
      lastErrorCode: 'SOURCE_NOT_CLOUD',
    });
    return;
  }
  const secretName = command.secretName;
  if (!secretName) {
    emit({
      sourceId: command.sourceId,
      hostId,
      revision: failRevision,
      state: 'failed',
      lastErrorCode: 'CLOUD_CREDENTIALS_INVALID',
    });
    return;
  }
  const values = await resolveFleetSecretByOperation({
    relayUrl: session.identity.relayUrl,
    orgId: session.identity.orgId,
    token: session.identity.token,
    operationId: command.operationId,
    names: [secretName],
  });
  const tokenJson = values[secretName];
  if (!tokenJson) {
    emit({
      sourceId: command.sourceId,
      hostId,
      revision: failRevision,
      state: 'failed',
      lastErrorCode: 'CLOUD_CREDENTIALS_INVALID',
    });
    return;
  }
  const key = googleCredKey(secretName);
  await deps.secrets.set(session.identity.orgId, key, tokenJson);
  const oauth = await loadGoogleOAuthClient(deps.secrets, session.identity.orgId);
  try {
    const result = await materializeCloudSourceOnHost({
      orgId: session.identity.orgId,
      sourceId: command.sourceId,
      hostId,
      remoteFolderId: source.distribution.remoteFolderId,
      getAccessToken: () =>
        getValidGoogleAccessToken(deps.secrets, session.identity.orgId, secretName, oauth),
      layout: deps.layout,
      materializations: deps.materializations,
      force,
    });
    emit({
      sourceId: command.sourceId,
      hostId,
      revision: Math.max(result.revision, failRevision),
      state: result.state,
      lastErrorCode: result.errorCode,
      lastConflictPaths: [],
      refreshRequired: false,
    });
  } finally {
    await deps.secrets.delete(session.identity.orgId, key);
  }
}
