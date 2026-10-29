import { materializeGitSourceOnHost } from '../../application/source/materialize-git-source.ts';
import type { OrgExecutionReplicaPort } from '../../domain/fleet/org-execution-replica.port.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import type { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import type { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import type { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { hasGitVcs, sourceHostAvailability } from '../../domain/source/vcs-capability.ts';
import { sanitizeGitText } from '../source/drivers/git/git-engine.ts';
import { resolveFleetSecretByOperation } from './fleet-secret-resolver.ts';
import { runCloudSourceMaterialize } from './worker-dialer.cloud-materialize.ts';
import type { DialerSession } from './worker-dialer.session.ts';

export interface WorkerMaterializeDeps {
  replica: OrgExecutionReplicaPort;
  layout: HostFsLayoutPort;
  machineConfig: MachineConfigPort;
  driver: SourceDriverPort;
  materializations: SourceMaterializationPort;
  secrets: SecretStorePort;
}

interface SourceCommand {
  operationId: string;
  sourceId: string;
  sourceRevision: number;
  projectionRevision: number;
  worktreeId?: string;
  secretName?: string;
}

export function runSourceAttach(
  deps: Pick<WorkerMaterializeDeps, 'machineConfig' | 'materializations'>,
  session: DialerSession,
  command: { sourceId: string; localPath: string; revision: number },
): void {
  const hostId = deps.machineConfig.get().id;
  const absolutePath = command.localPath.trim();
  if (!absolutePath.startsWith('/')) {
    emitMaterialization(session, {
      sourceId: command.sourceId,
      hostId,
      revision: command.revision,
      state: 'failed',
      lastErrorCode: 'ATTACH_PATH_INVALID',
    });
    return;
  }
  deps.materializations.upsert({
    orgId: session.identity.orgId,
    sourceId: command.sourceId,
    hostId,
    origin: 'attached',
    localPath: absolutePath,
    state: 'ready',
    revision: command.revision,
    updatedAt: new Date().toISOString(),
    lastError: null,
  });
  emitMaterialization(session, {
    sourceId: command.sourceId,
    hostId,
    revision: command.revision,
    state: 'ready',
  });
}

export function replayMaterializationStates(
  deps: WorkerMaterializeDeps,
  session: DialerSession,
): void {
  const hostId = deps.machineConfig.get().id;
  const snapshot = deps.replica.get(session.identity.orgId);
  if (!snapshot) {
    return;
  }
  for (const source of snapshot.sources) {
    if (!hasGitVcs(source) && source.distribution.kind !== 'cloud-drive') {
      continue;
    }
    const mat = deps.materializations.find(session.identity.orgId, source.id, hostId);
    if (!mat || mat.state === 'absent') {
      continue;
    }
    emitMaterialization(session, {
      sourceId: source.id,
      hostId,
      revision: mat.revision,
      state: mat.state,
      lastErrorCode: mat.lastError ?? undefined,
      lastConflictPaths: mat.lastConflictPaths,
      refreshRequired: mat.refreshRequired,
    });
  }
}

export async function runSourceMaterialize(
  deps: WorkerMaterializeDeps,
  session: DialerSession,
  command: SourceCommand,
): Promise<void> {
  const snapshot = deps.replica.get(session.identity.orgId);
  const source = snapshot?.sources.find((item) => item.id === command.sourceId);
  const hostId = deps.machineConfig.get().id;
  if (source?.distribution.kind === 'cloud-drive') {
    await runCloudSourceMaterialize(deps, session, command, false, (frame) =>
      emitMaterialization(session, frame),
    );
    return;
  }
  const failRevision = command.projectionRevision + 1;
  const accepted = deps.replica.acceptedRevision(session.identity.orgId);
  if (!snapshot || accepted === null || accepted < command.sourceRevision) {
    emitMaterialization(session, {
      sourceId: command.sourceId,
      hostId,
      revision: failRevision,
      state: 'failed',
      lastErrorCode: 'SOURCE_REVISION_MISMATCH',
    });
    return;
  }
  if (!source || !hasGitVcs(source)) {
    emitMaterialization(session, {
      sourceId: command.sourceId,
      hostId,
      revision: failRevision,
      state: 'failed',
      lastErrorCode: 'SOURCE_NOT_GIT',
    });
    return;
  }
  if (!sourceHostAvailability(source, hostId).allowed) {
    emitMaterialization(session, {
      sourceId: command.sourceId,
      hostId,
      revision: failRevision,
      state: 'failed',
      lastErrorCode: 'SOURCE_NOT_ALLOWED',
    });
    return;
  }
  const worktreeId = command.worktreeId;
  if (!worktreeId) {
    emitMaterialization(session, {
      sourceId: command.sourceId,
      hostId,
      revision: failRevision,
      state: 'failed',
      lastErrorCode: 'WORKTREE_ID_REQUIRED',
    });
    return;
  }
  const result = await materializeGitSourceOnHost({
    orgId: session.identity.orgId,
    sourceId: command.sourceId,
    hostId,
    url: source.vcs?.remoteUrl ?? '',
    branch: source.vcs?.defaultBranch ?? undefined,
    worktreeId,
    layout: deps.layout,
    driver: deps.driver,
    materializations: deps.materializations,
    credRef: source.vcs?.credRef ?? undefined,
    resolveCredential: source.vcs?.credRef
      ? async (credRef) => {
          const values = await resolveFleetSecretByOperation({
            relayUrl: session.identity.relayUrl,
            orgId: session.identity.orgId,
            token: session.identity.token,
            operationId: command.operationId,
            names: [credRef],
          });
          return values[credRef] ?? null;
        }
      : null,
  });
  emitMaterialization(session, {
    sourceId: command.sourceId,
    hostId,
    revision: Math.max(result.revision, failRevision),
    state: result.state,
    lastErrorCode: result.errorCode,
  });
}

export async function runSourceRefresh(
  deps: WorkerMaterializeDeps,
  session: DialerSession,
  command: SourceCommand,
): Promise<void> {
  const snapshot = deps.replica.get(session.identity.orgId);
  const source = snapshot?.sources.find((item) => item.id === command.sourceId);
  const hostId = deps.machineConfig.get().id;
  const failRevision = command.projectionRevision + 1;
  if (source?.distribution.kind === 'cloud-drive') {
    await runCloudSourceMaterialize(deps, session, command, true, (frame) =>
      emitMaterialization(session, frame),
    );
    return;
  }
  if (!source || !hasGitVcs(source)) {
    emitMaterialization(session, {
      sourceId: command.sourceId,
      hostId,
      revision: failRevision,
      state: 'failed',
      lastErrorCode: 'SOURCE_NOT_GIT',
    });
    return;
  }
  if (!sourceHostAvailability(source, hostId).allowed) {
    emitMaterialization(session, {
      sourceId: command.sourceId,
      hostId,
      revision: failRevision,
      state: 'failed',
      lastErrorCode: 'SOURCE_NOT_ALLOWED',
    });
    return;
  }
  const existing = deps.materializations.find(session.identity.orgId, command.sourceId, hostId);
  if (existing?.state !== 'ready') {
    await runSourceMaterialize(deps, session, command);
    return;
  }
  const worktreeId = command.worktreeId;
  if (!worktreeId) {
    emitMaterialization(session, {
      sourceId: command.sourceId,
      hostId,
      revision: failRevision,
      state: 'failed',
      lastErrorCode: 'WORKTREE_ID_REQUIRED',
    });
    return;
  }
  try {
    const gitLayout = {
      bareRepoPath: deps.layout.orgSourceDir(session.identity.orgId, command.sourceId),
      worktreesRoot: deps.layout.sourceWorktreesDir(session.identity.orgId, command.sourceId),
    };
    const branch = source.vcs?.defaultBranch?.trim() || 'main';
    if (source.vcs?.credRef) {
      await resolveFleetSecretByOperation({
        relayUrl: session.identity.relayUrl,
        orgId: session.identity.orgId,
        token: session.identity.token,
        operationId: command.operationId,
        names: [source.vcs.credRef],
      });
    }
    await deps.driver.refresh(gitLayout, worktreeId, branch);
    const contentRoot = deps.driver.resolveContentRoot(gitLayout, worktreeId);
    const revision = Math.max(existing.revision + 1, failRevision);
    deps.materializations.upsert({
      orgId: session.identity.orgId,
      sourceId: command.sourceId,
      hostId,
      origin: 'managed',
      localPath: contentRoot,
      state: 'ready',
      revision,
      updatedAt: new Date().toISOString(),
      lastError: null,
    });
    emitMaterialization(session, {
      sourceId: command.sourceId,
      hostId,
      revision,
      state: 'ready',
    });
  } catch (err) {
    const revision = Math.max(existing.revision + 1, failRevision);
    const errorCode =
      err instanceof Error ? sanitizeGitText(err.message).slice(0, 200) : 'refresh_failed';
    deps.materializations.upsert({
      orgId: session.identity.orgId,
      sourceId: command.sourceId,
      hostId,
      origin: 'managed',
      localPath: existing.localPath,
      state: 'failed',
      revision,
      updatedAt: new Date().toISOString(),
      lastError: errorCode,
    });
    emitMaterialization(session, {
      sourceId: command.sourceId,
      hostId,
      revision,
      state: 'failed',
      lastErrorCode: errorCode,
    });
  }
}

function emitMaterialization(
  session: DialerSession,
  frame: {
    sourceId: string;
    hostId: string;
    revision: number;
    state: 'absent' | 'materializing' | 'ready' | 'failed';
    lastErrorCode?: string;
    lastConflictPaths?: string[];
    refreshRequired?: boolean;
  },
): void {
  try {
    session.socket?.send(
      JSON.stringify({
        kind: 'SOURCE_MATERIALIZATION',
        ...frame,
      }),
    );
  } catch {
    // ignore
  }
}
