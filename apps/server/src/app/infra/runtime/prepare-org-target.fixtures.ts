import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PackAssignmentBody } from '@harnesys/contracts';
import type { AgentMode } from '@harnesys/studio-shared';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { ModePresetRecord } from '../../domain/mode-presets/mode-preset.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import {
  MemoryAgents,
  MemoryModels,
  MemoryModes,
  MemoryProviders,
  MemoryThreads,
  notUsed,
  StubMachineConfig,
  StubSourceLocation,
  StubSources,
} from './prepare-org-target.fakes.ts';
import type { PrepareOrgTargetDeps, TargetCache } from './prepare-org-target.ts';

let baseDir = '';

export class StubLayout extends HostFsLayoutPort {
  constructor(private readonly root: string) {
    super();
  }

  home(): string {
    return notUsed();
  }

  configPath(): string {
    return notUsed();
  }

  machinePath(): string {
    return notUsed();
  }

  machineDbPath(): string {
    return notUsed();
  }

  identityDbPath(): string {
    return notUsed();
  }

  marketplacesDir(): string {
    return notUsed();
  }

  marketplaceInstallPath(): string {
    return notUsed();
  }

  orgDir(): string {
    return notUsed();
  }

  orgDbPath(): string {
    return notUsed();
  }

  orgDataDir(): string {
    return notUsed();
  }

  orgWorkspacePath(): string {
    return notUsed();
  }

  orgSourceDir(): string {
    return notUsed();
  }

  sourceWorktreesDir(): string {
    return notUsed();
  }

  skillsDir(): string {
    return notUsed();
  }

  systemSkillsDir(): string {
    return notUsed();
  }

  hostAgentSkillsDir(): string {
    return notUsed();
  }

  orgSettingsPath(): string {
    return notUsed();
  }

  skillsStagingDir(): string {
    return notUsed();
  }

  mcpConfigPath(): string {
    return notUsed();
  }

  pluginsDir(): string {
    return notUsed();
  }

  pluginsDataDir(): string {
    return notUsed();
  }

  lspConfigPath(): string {
    return notUsed();
  }

  threadDir(orgId: string, threadId: string): string {
    return join(this.root, orgId, threadId);
  }

  nodesDir(): string {
    return notUsed();
  }

  nodeIdentityPath(): string {
    return notUsed();
  }

  ensureHome(): void {}

  ensureMarketplacesDir(): string {
    return notUsed();
  }

  ensureOrgDir(): void {}

  ensureOrgDataDir(): void {}

  ensureOrgWorkspace(): string {
    return notUsed();
  }

  ensureOrgSourceDir(): string {
    return notUsed();
  }

  ensureSourceWorktreesDir(): string {
    return notUsed();
  }

  ensureSkillsDir(): string {
    return notUsed();
  }

  ensurePluginsDir(): string {
    return notUsed();
  }

  ensureThreadDir(orgId: string, threadId: string): string {
    return join(this.root, orgId, threadId);
  }

  ensureNodesDir(): void {}

  removeOrgDir(): void {}

  removeOrgDataDir(): void {}
}

export function threadRecord(runMode: string | undefined): ThreadRecord {
  const now = new Date(0).toISOString();
  return {
    id: 'thread-1',
    orgId: 'org-1',
    agentId: 'agent-1',
    originAgentId: 'agent-1',
    title: 't',
    kind: 'chat',
    parentThreadId: null,
    forkAt: null,
    inheritedEventCount: 0,
    metadata: runMode === undefined ? {} : { runMode },
    runProfileId: null,
    runDirectory: null,
    createdAt: now,
    updatedAt: now,
    lastReadAt: now,
  };
}

export function agentRecord(sharedSourceIds: string[] = []): AgentRecord {
  const now = new Date(0).toISOString();
  return {
    id: 'agent-1',
    orgId: 'org-1',
    name: 'coder',
    role: 'coder',
    instructions: 'code',
    modelId: 'model-1',
    budgetUsdDaily: null,
    level: 'top',
    parentId: null,
    executionProfileId: null,
    status: 'active',
    sharedSourceIds,
    sourceLevels: {},
    secretNames: [],
    skills: [],
    mcpServers: [],
    enabledPlugins: {},
    defaultModeId: 'plan',
    config: { permissionsJson: { 'fs.write': 'allow', process: 'allow' } },
    hooks: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function presetRecord(): ModePresetRecord {
  const now = new Date(0).toISOString();
  return {
    orgId: 'org-1',
    id: 'plan',
    name: 'Plan',
    description: 'plan mode',
    instructions: '',
    skills: [],
    packs: {},
    permissions: { 'fs.write': 'deny', process: 'deny' },
    builtin: true,
    installedByDefault: true,
    createdAt: now,
    updatedAt: now,
  };
}

export interface BuildShellOpts {
  agentShell?: Record<string, unknown>;
  presetShell?: PackAssignmentBody;
  agentModes?: AgentMode[];
}

export function build(
  runMode: string | undefined,
  shell?: BuildShellOpts,
  sharedSourceIds: string[] = [],
): { deps: PrepareOrgTargetDeps; cache: TargetCache; modes: MemoryModes } {
  baseDir = mkdtempSync(join(tmpdir(), 'prepare-target-'));
  const threads = new MemoryThreads();
  threads.thread = threadRecord(runMode);
  const agents = new MemoryAgents();
  const agent = agentRecord(sharedSourceIds);
  if (shell?.agentShell !== undefined) {
    agent.config = { ...agent.config, capabilitiesJson: { shell: shell.agentShell } };
  }
  if (shell?.agentModes !== undefined) {
    agent.config = { ...agent.config, modesJson: shell.agentModes };
  }
  agents.agent = agent;
  const modes = new MemoryModes();
  const preset = presetRecord();
  if (shell?.presetShell !== undefined) {
    preset.packs = { shell: shell.presetShell };
  }
  modes.preset = preset;
  const deps: PrepareOrgTargetDeps = {
    orgId: 'org-1',
    layout: new StubLayout(baseDir),
    machineConfig: new StubMachineConfig(),
    threads,
    agents,
    modes,
    sources: new StubSources(),
    sourceLocation: new StubSourceLocation(baseDir),
    providers: new MemoryProviders(),
    models: new MemoryModels(),
  };
  return { deps, cache: new Map(), modes };
}

export function currentBaseDir(): string {
  return baseDir;
}

export function disposeBaseDir(): void {
  if (baseDir !== '') {
    rmSync(baseDir, { recursive: true, force: true });
    baseDir = '';
  }
}
