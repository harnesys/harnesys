import { CONSOLE_LOGGER, type ProcessJobTarget } from 'harnesys';
import type { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import type { FileRuleRecord } from '../../domain/file-access/file-access-rule.ts';
import type { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import type { RunIsolation } from '../../domain/fleet/placement.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import type { WorkspaceContainerPort } from '../../domain/process-runtime/workspace-container.port.ts';
import type { RunTriggerKind } from '../../domain/thread/prepare-runtime-input.ts';

export interface ThreadBinding {
  directory?: string;
  sourceId?: string;
  worktreeId?: string;
  isolation?: RunIsolation;
  triggerKind?: RunTriggerKind;
  branch?: string;
}

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
  isolation?: RunIsolation;
  worktreeId?: string;
  sourceId?: string;
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
  if (input.isolation?.mode !== 'container') {
    return undefined;
  }
  const mounts = workspaceMounts(input);
  if (input.worktreeId) {
    return { workspaceKey: `worktree:${input.worktreeId}`, mounts };
  }
  if (input.sourceId) {
    return { workspaceKey: `source:${input.sourceId}@${input.hostId}`, mounts };
  }
  return undefined;
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
  binding: ThreadBinding | undefined,
  prepared: PreparedWorkspacePaths,
): Promise<ProcessJobTarget | undefined> {
  const hostId = deps.machineConfig.get().id;
  const orgDataDir = deps.layout.orgDataDir(deps.orgId);
  const workspace = workspaceTargetOf({
    ...(binding?.isolation ? { isolation: binding.isolation } : {}),
    ...(binding?.worktreeId ? { worktreeId: binding.worktreeId } : {}),
    ...(binding?.sourceId ? { sourceId: binding.sourceId } : {}),
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
  if (!workspace || binding?.isolation?.mode !== 'container') {
    return undefined;
  }
  const ref = await deps.containers.ensure({
    orgId: deps.orgId,
    workspaceKey: workspace.workspaceKey,
    image: binding.isolation.image,
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

function trimTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '');
}
