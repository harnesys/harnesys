import { closeSync, mkdtempSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { SandboxSpawnSpec, SpawnedAddonProcess } from './sandbox-launcher.port.ts';
import { SandboxLauncherPort, whitelistedAddonEnv } from './sandbox-launcher.port.ts';
import { buildKernelSeccompFilter, buildSeccompFilter, seccompArchFor } from './seccomp-filter.ts';
import { buildSeccompPreload } from './seccomp-preload.ts';
import { spawnPiped } from './spawn-piped.ts';

const BWRAP = 'bwrap';
const SECCOMP_SPAWN_FD = 3;
const SECCOMP_PROBE_FD = 0;
const PROBE_TIMEOUT_MS = 10_000;

@Injectable()
export class LauncherLinuxAdapter extends SandboxLauncherPort {
  readonly mechanism = 'bubblewrap';

  available(): boolean {
    return bwrapUsable();
  }

  async spawn(spec: SandboxSpawnSpec): Promise<SpawnedAddonProcess> {
    const arch = seccompArchFor(process.arch);
    if (arch === null) {
      throw new Error(`addon sandbox unavailable: no seccomp table for ${process.arch}`);
    }
    const preloadPath = writePreload(buildSeccompFilter(arch), 'harnesys-addon-seccomp-');
    const kernelFilter = buildKernelSeccompFilter(arch);
    const [interpreter, ...interpreterArgs] = spec.command;
    if (interpreter === undefined) {
      throw new Error(`addon ${spec.addonId} has an empty spawn command`);
    }
    const command = [
      ...bwrapCommand(spec),
      interpreter,
      '--preload',
      preloadPath,
      ...interpreterArgs,
    ];
    const spawned = spawnPiped(command, spec.packageRoot, whitelistedAddonEnv(spec), ['socket-fd']);
    const filterFd = spawned.extraFds[0];
    if (typeof filterFd !== 'number') {
      spawned.child.kill(9);
      throw new Error('addon sandbox unavailable: seccomp fd slot was not exposed');
    }
    try {
      writeAllSync(filterFd, kernelFilter);
    } finally {
      closeSync(filterFd);
    }
    return { stdio: spawned.stdio, child: spawned.child };
  }
}

// --seccomp FD makes bwrap read the cBPF program from an already open fd; the
// parent-end fd of the 'socket-fd' stdio slot (index 3) is exposed as a number
// on Subprocess.stdio, written once and closed so the read loop sees EOF.
function hardeningFlags(seccompFd: number): string[] {
  return [
    BWRAP,
    '--die-with-parent',
    '--new-session',
    '--unshare-user',
    '--unshare-pid',
    '--unshare-net',
    '--unshare-ipc',
    '--disable-userns',
    '--cap-drop',
    'ALL',
    '--ro-bind',
    '/',
    '/',
    '--proc',
    '/proc',
    '--dev',
    '/dev',
    '--seccomp',
    String(seccompFd),
  ];
}

export function bwrapCommand(spec: SandboxSpawnSpec): string[] {
  return [
    ...hardeningFlags(SECCOMP_SPAWN_FD),
    '--bind',
    spec.dataDir,
    spec.dataDir,
    '--bind-try',
    tmpdir(),
    tmpdir(),
  ];
}

let probed: boolean | null = null;

function bwrapUsable(): boolean {
  if (probed !== null) {
    return probed;
  }
  probed = false;
  const arch = seccompArchFor(process.arch);
  if (process.platform !== 'linux' || arch === null || Bun.which(BWRAP) === null) {
    return probed;
  }
  const dir = mkdtempSync(join(tmpdir(), 'harnesys-addon-seccomp-probe-'));
  try {
    const preloadPath = join(dir, 'probe-preload.ts');
    writeFileSync(preloadPath, buildSeccompPreload(buildSeccompFilter(arch)));
    const mainPath = join(dir, 'probe-main.ts');
    writeFileSync(mainPath, 'process.exit(0);\n');
    const probe = Bun.spawnSync(
      [
        ...hardeningFlags(SECCOMP_PROBE_FD),
        '--bind-try',
        tmpdir(),
        tmpdir(),
        '--',
        'bun',
        '--preload',
        preloadPath,
        mainPath,
      ],
      {
        stdout: 'ignore',
        stderr: 'ignore',
        timeout: PROBE_TIMEOUT_MS,
        stdin: buildKernelSeccompFilter(arch),
      },
    );
    probed = probe.exitCode === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return probed;
}

function writePreload(filter: Uint8Array, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const path = join(dir, 'seccomp-preload.ts');
  writeFileSync(path, buildSeccompPreload(filter));
  return path;
}

function writeAllSync(fd: number, data: Uint8Array): void {
  let written = 0;
  while (written < data.length) {
    written += writeSync(fd, data, written);
  }
}
