import type { RunEnvironment } from '@harnesys/contracts';
import { CONSOLE_LOGGER, type ProcessJobTarget } from 'harnesys';
import { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import type { FileRuleRecord } from '../../domain/file-access/file-access-rule.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import type { RunIsolation } from '../../domain/fleet/placement.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { WorkspaceContainerPort } from '../../domain/process-runtime/workspace-container.port.ts';

export interface WorkspaceTargetDeps {
  orgId: string;
  layout: HostFsLayoutPort;
  machineConfig: MachineConfigPort;
  containers: WorkspaceContainerPort;
  fileRules?: FileAccessRulePort;
  nodes?: NodeRepository;
}

export interface WorkspaceTarget {
  workspaceKey: string;
  mounts: string[];
}

export interface WorkspaceTargetOfInput {
  environment?: RunEnvironment;
  hostId: string;
  orgDataDir: string;
  primaryDir?: string;
  threadDirs: readonly string[];
  declaredRuleDirs: readonly string[];
}

export interface PreparedWorkspacePaths {
  agentId: string;
  paths: { cwd: string; threadDir: string };
}

export function preparedWorkspacePathsOf(prepared: {
  agent: { id: string };
  paths: { cwd: string; threadDir: string };
}): PreparedWorkspacePaths {
  return {
    agentId: prepared.agent.id,
    paths: { cwd: prepared.paths.cwd, threadDir: prepared.paths.threadDir },
  };
}

export function workspaceTargetOf(input: WorkspaceTargetOfInput): WorkspaceTarget | undefined {
  const anchor = input.environment?.anchor;
  if (!anchor) {
    return undefined;
  }
  if (anchor.kind === 'folder') {
    return {
      workspaceKey: `folder:${input.hostId}:${anchor.path}`,
      mounts: uniqueMounts([input.orgDataDir, anchor.path]),
    };
  }
  const mounts = workspaceMounts(input);
  if (anchor.worktreeId !== undefined) {
    return { workspaceKey: `worktree:${anchor.worktreeId}`, mounts };
  }
  return { workspaceKey: `source:${anchor.sourceId}@${input.hostId}`, mounts };
}

export function declaredRuleDirsOf(
  rules: FileRuleRecord[],
  orgDataDir: string,
  hostId: string,
): string[] {
  const dataDir = trimTrailingSlash(orgDataDir);
  return rules
    .filter(
      (rule) =>
        rule.effect === 'allow' &&
        !rule.pathPattern.includes('*') &&
        (rule.hostId === null || rule.hostId === hostId),
    )
    .map((rule) => rule.pathPattern)
    .filter((dir) => {
      const trimmed = trimTrailingSlash(dir);
      return trimmed !== dataDir && !trimmed.startsWith(`${dataDir}/`);
    });
}

export async function resolveProcessTarget(
  deps: WorkspaceTargetDeps,
  environment: RunEnvironment | undefined,
  prepared: PreparedWorkspacePaths,
  isolation?: RunIsolation,
): Promise<ProcessJobTarget | undefined> {
  const hostId = deps.machineConfig.get().id;
  const orgDataDir = deps.layout.orgDataDir(deps.orgId);
  const workspace = workspaceTargetOf({
    ...(environment ? { environment } : {}),
    hostId,
    orgDataDir,
    primaryDir: prepared.paths.cwd,
    threadDirs: [prepared.paths.threadDir],
    declaredRuleDirs: declaredRuleDirsOf(
      deps.fileRules?.listForAgent(deps.orgId, prepared.agentId) ?? [],
      orgDataDir,
      hostId,
    ),
  });
  if (!workspace || isolation?.mode !== 'container') {
    return undefined;
  }
  const ref = await deps.containers.ensure({
    orgId: deps.orgId,
    workspaceKey: workspace.workspaceKey,
    image: isolation.image,
    mounts: workspace.mounts,
  });
  return {
    kind: 'container',
    containerId: ref.containerId,
    orgId: deps.orgId,
    workspaceKey: workspace.workspaceKey,
  };
}

export function reconcileWorkspaces(deps: WorkspaceTargetDeps): void {
  void deps.containers.reconcile(deps.orgId).catch((error: unknown) => {
    CONSOLE_LOGGER.error(`workspace reconcile failed for ${deps.orgId}: ${String(error)}`);
  });
  void probeRelayDocker(deps).catch((error: unknown) => {
    CONSOLE_LOGGER.error(`docker probe failed for ${deps.orgId}: ${String(error)}`);
  });
}

async function probeRelayDocker(deps: WorkspaceTargetDeps): Promise<void> {
  if (deps.nodes === undefined) {
    return;
  }
  const dockerAvailable = await deps.containers.probe();
  deps.nodes.updatePresence(deps.orgId, deps.machineConfig.get().id, {
    lastSeenAt: new Date().toISOString(),
    status: 'online',
    dockerAvailable,
  });
}

function workspaceMounts(input: WorkspaceTargetOfInput): string[] {
  const dataDir = trimTrailingSlash(input.orgDataDir);
  const mounts = [input.orgDataDir];
  const candidates = [input.primaryDir, ...input.threadDirs, ...input.declaredRuleDirs];
  for (const candidate of candidates) {
    if (candidate === undefined) {
      continue;
    }
    const trimmed = trimTrailingSlash(candidate);
    if (trimmed === dataDir || trimmed.startsWith(`${dataDir}/`)) {
      continue;
    }
    if (!mounts.includes(trimmed)) {
      mounts.push(trimmed);
    }
  }
  return mounts;
}

function uniqueMounts(mounts: string[]): string[] {
  return [...new Set(mounts)];
}

function trimTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '');
}
