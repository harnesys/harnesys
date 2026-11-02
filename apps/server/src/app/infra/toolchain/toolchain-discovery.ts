import { existsSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import type {
  ToolchainCommandStatus,
  ToolchainNodeManager,
  ToolchainNodeVersion,
  ToolchainShell,
  ToolchainShellKind,
} from '@harnesys/contracts';
import { expandHome, isExecutable } from './effective-path.ts';

const NODE_MANAGER_ROOTS: {
  manager: ToolchainNodeManager;
  subpaths: string[];
  binSub: string[][];
}[] = [
  { manager: 'nvm', subpaths: ['.nvm/versions/node'], binSub: [['bin']] },
  {
    manager: 'fnm',
    subpaths: [
      'Library/Application Support/fnm/node-versions',
      '.local/share/fnm/node-versions',
      '.fnm/node-versions',
    ],
    binSub: [['installation', 'bin'], ['bin']],
  },
  { manager: 'volta', subpaths: ['.volta/tools/image/node'], binSub: [['bin']] },
  {
    manager: 'mise',
    subpaths: ['.local/share/mise/installs/node', '.config/mise/installs/node'],
    binSub: [['bin']],
  },
  { manager: 'asdf', subpaths: ['.asdf/installs/node'], binSub: [['bin']] },
];

const SHELL_CANDIDATES: Array<{ path: string; kind: ToolchainShellKind }> = [
  { path: '/bin/zsh', kind: 'zsh' },
  { path: '/usr/bin/zsh', kind: 'zsh' },
  { path: '/opt/homebrew/bin/zsh', kind: 'zsh' },
  { path: '/bin/bash', kind: 'bash' },
  { path: '/usr/bin/bash', kind: 'bash' },
  { path: '/opt/homebrew/bin/bash', kind: 'bash' },
  { path: '/bin/fish', kind: 'fish' },
  { path: '/usr/bin/fish', kind: 'fish' },
  { path: '/bin/sh', kind: 'sh' },
];

const GLOBAL_BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin'];

export function scanNodeVersions(home: string): ToolchainNodeVersion[] {
  const versions: ToolchainNodeVersion[] = [];
  for (const root of NODE_MANAGER_ROOTS) {
    for (const subpath of root.subpaths) {
      const parent = join(home, subpath);
      if (!existsSync(parent)) {
        continue;
      }
      versions.push(...readManagerVersions(parent, root.manager, root.binSub));
    }
  }
  return versions;
}

export function detectedShells(): ToolchainShell[] {
  return SHELL_CANDIDATES.filter((candidate) => isExecutable(candidate.path));
}

export function defaultShell(shells: readonly ToolchainShell[]): ToolchainShell | undefined {
  return shells.find((shell) => shell.kind === 'zsh') ?? shells[0];
}

export function resolveShellPath(
  setting: string,
  _home: string,
  envShell: string | undefined,
  shells: readonly ToolchainShell[],
): string | undefined {
  if (setting !== 'auto') {
    return setting;
  }
  if (envShell !== undefined && envShell.length > 0) {
    return envShell;
  }
  const auto = defaultShell(shells);
  return auto?.path ?? '/bin/zsh';
}

export function globalBinDirs(home: string, nodeBin?: string): string[] {
  const dirs = [
    ...(nodeBin !== undefined ? [nodeBin] : []),
    join(home, '.bun/bin'),
    join(home, 'Library/pnpm'),
    join(home, '.local/share/pnpm'),
    join(home, '.yarn/bin'),
    join(home, '.config/yarn/global/node_modules/.bin'),
    ...GLOBAL_BIN_DIRS,
  ];
  return dirs;
}

export function overrideDirs(overrides: Record<string, string>): string[] {
  return Object.values(overrides)
    .filter((path) => path.length > 0 && isAbsolute(path))
    .map((path) => dirname(path));
}

export function pickNodeBin(
  versions: readonly ToolchainNodeVersion[],
  setting: string,
): string | undefined {
  if (setting !== 'auto') {
    return versions.find((version) => version.id === setting)?.binDir;
  }
  const latest = [...versions].sort(compareVersionsDesc)[0];
  return latest?.binDir;
}

export function versionIdOf(manager: ToolchainNodeManager, version: string): string {
  return `${manager}-${version}`;
}

export function assembleDirs(input: {
  probed: string[];
  managedDirs: string[];
  extraDirs: readonly string[];
  overrideDirs: readonly string[];
  home: string;
}): string[] {
  const [firstManaged, ...restManaged] = input.managedDirs;
  const ordered = [
    ...input.overrideDirs,
    ...(firstManaged !== undefined ? [firstManaged] : []),
    ...input.probed,
    ...restManaged,
    ...input.extraDirs,
  ];
  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const raw of ordered) {
    const dir = expandHome(raw.trim(), input.home);
    if (dir.length === 0 || seen.has(dir)) {
      continue;
    }
    seen.add(dir);
    dirs.push(dir);
  }
  return dirs;
}

export function commandStatus(
  command: string,
  overrides: Record<string, string>,
  dirs: readonly string[],
): ToolchainCommandStatus {
  const override = overrides[command];
  if (override !== undefined && override.length > 0 && isAbsolute(override)) {
    return {
      command,
      resolvedPath: isExecutable(override) ? override : null,
      source: 'override',
    };
  }
  if (command.includes('/') || command.includes('\\')) {
    return {
      command,
      resolvedPath: isExecutable(command) ? command : null,
      source: 'path',
    };
  }
  for (const dir of dirs) {
    const candidate = join(dir, command);
    if (isExecutable(candidate)) {
      return { command, resolvedPath: candidate, source: 'path' };
    }
  }
  return { command, resolvedPath: null, source: 'missing' };
}

function readManagerVersions(
  parent: string,
  manager: ToolchainNodeManager,
  binCandidates: string[][],
): ToolchainNodeVersion[] {
  const versions: ToolchainNodeVersion[] = [];
  for (const name of readdirSync(parent)) {
    if (!/^v?\d/.test(name)) {
      continue;
    }
    const root = join(parent, name);
    const binDir = pickBinDir(root, binCandidates);
    if (binDir === undefined || !existsSync(join(binDir, 'node'))) {
      continue;
    }
    const version = name.startsWith('v') ? name : `v${name}`;
    versions.push({ id: versionIdOf(manager, version), version, manager, binDir });
  }
  return versions;
}

function pickBinDir(root: string, candidates: string[][]): string | undefined {
  for (const candidate of candidates) {
    const binDir = join(root, join(...candidate));
    if (existsSync(binDir)) {
      return binDir;
    }
  }
  return undefined;
}

function compareVersionsDesc(left: ToolchainNodeVersion, right: ToolchainNodeVersion): number {
  const delta = compareVersionParts(left.version, right.version);
  if (delta !== 0) {
    return -delta;
  }
  if (right.version < left.version) {
    return -1;
  }
  if (right.version > left.version) {
    return 1;
  }
  return 0;
}

function compareVersionParts(left: string, right: string): number {
  const leftParts = versionNumbers(left);
  const rightParts = versionNumbers(right);
  for (let index = 0; index < 3; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function versionNumbers(version: string): number[] {
  return version
    .replace(/^v/, '')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((num) => (Number.isNaN(num) ? 0 : num));
}
