import type { ListRepositoryWorktreesResponse } from '@harnesys/contracts';
import type { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import type { RepositoryWorktree } from '../../domain/source/repository-worktree.ts';
import type { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import type { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';

export interface IssueWorktreeBinding {
  sourceId: string;
  worktreeId: string;
  hostId: string;
  dirty: boolean;
  unpushed: boolean;
}

export interface ObserveWorktreeInput {
  orgId: string;
  machineConfig: MachineConfigPort;
  layout: HostFsLayoutPort;
  driver: SourceDriverPort;
  contentProxy?: FleetContentProxyPort;
}

export async function observeWorktreeBinding(
  input: ObserveWorktreeInput,
  row: RepositoryWorktree,
): Promise<IssueWorktreeBinding | null> {
  if (row.state !== 'ready' && row.state !== 'creating') {
    return null;
  }
  return observeBinding(input, row);
}

export function pickReusableWorktree(rows: RepositoryWorktree[]): RepositoryWorktree | null {
  return rows.find((row) => row.state === 'ready' || row.state === 'creating') ?? null;
}

export function pickReadyHost(input: {
  orgId: string;
  sourceId: string;
  materializations: SourceMaterializationPort;
  localHostId: string;
}): string | null {
  const localMat = input.materializations.find(input.orgId, input.sourceId, input.localHostId);
  const localProj = input.materializations.findProjection(
    input.orgId,
    input.sourceId,
    input.localHostId,
  );
  if (localMat?.state === 'ready' || localProj?.state === 'ready') {
    return input.localHostId;
  }
  const readyMat = input.materializations
    .listForSource(input.orgId, input.sourceId)
    .find((row) => row.state === 'ready');
  if (readyMat) {
    return readyMat.hostId;
  }
  const readyProj = input.materializations
    .listProjectionsForSource(input.orgId, input.sourceId)
    .find((row) => row.state === 'ready');
  return readyProj?.hostId ?? null;
}

async function observeBinding(
  input: {
    orgId: string;
    machineConfig: MachineConfigPort;
    layout: HostFsLayoutPort;
    driver: SourceDriverPort;
    contentProxy?: FleetContentProxyPort;
  },
  row: RepositoryWorktree,
): Promise<IssueWorktreeBinding> {
  const localHostId = input.machineConfig.get().id;
  if (row.hostId !== localHostId) {
    return observeRemoteBinding(input, row);
  }
  if (row.state !== 'ready') {
    return {
      sourceId: row.sourceId,
      worktreeId: row.id,
      hostId: row.hostId,
      dirty: false,
      unpushed: false,
    };
  }
  const observation = await input.driver
    .observeWorktree(
      {
        bareRepoPath: input.layout.orgSourceDir(input.orgId, row.sourceId),
        worktreesRoot: input.layout.sourceWorktreesDir(input.orgId, row.sourceId),
      },
      row.id,
    )
    .catch(() => null);
  return {
    sourceId: row.sourceId,
    worktreeId: row.id,
    hostId: row.hostId,
    dirty: observation?.dirty === true,
    unpushed: observation?.unpushed === true,
  };
}

async function observeRemoteBinding(
  input: {
    orgId: string;
    contentProxy?: FleetContentProxyPort;
  },
  row: RepositoryWorktree,
): Promise<IssueWorktreeBinding> {
  const blocked: IssueWorktreeBinding = {
    sourceId: row.sourceId,
    worktreeId: row.id,
    hostId: row.hostId,
    dirty: true,
    unpushed: true,
  };
  if (!input.contentProxy || row.state !== 'ready') {
    return blocked;
  }
  try {
    const response = await input.contentProxy.requestProxy(row.hostId, {
      method: 'GET',
      path: `/api/orgs/${input.orgId}/sources/${row.sourceId}/worktrees`,
    });
    if (!response.ok) {
      return blocked;
    }
    const body = (await response.json()) as ListRepositoryWorktreesResponse;
    const remote = body.worktrees.find((item) => item.id === row.id);
    if (!remote) {
      return blocked;
    }
    return {
      sourceId: row.sourceId,
      worktreeId: row.id,
      hostId: row.hostId,
      dirty: remote.dirty === true,
      unpushed: remote.unpushed === true,
    };
  } catch {
    return blocked;
  }
}
