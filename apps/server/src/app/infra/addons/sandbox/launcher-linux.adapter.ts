import { tmpdir } from 'node:os';
import { Injectable } from '@harnesys/brix';
import type { SandboxSpawnSpec, SpawnedAddonProcess } from './sandbox-launcher.port.ts';
import { SandboxLauncherPort, whitelistedAddonEnv } from './sandbox-launcher.port.ts';
import { spawnPiped } from './spawn-piped.ts';

@Injectable()
export class LauncherLinuxAdapter extends SandboxLauncherPort {
  readonly mechanism = 'bubblewrap';

  available(): boolean {
    return bwrapUsable();
  }

  async spawn(spec: SandboxSpawnSpec): Promise<SpawnedAddonProcess> {
    const command = [...bwrapCommand(spec), ...spec.command];
    return spawnPiped(command, spec.packageRoot, whitelistedAddonEnv(spec));
  }
}

let probed: boolean | null = null;

function bwrapUsable(): boolean {
  if (probed !== null) {
    return probed;
  }
  probed = false;
  if (Bun.which('bwrap') === null) {
    return probed;
  }
  const probeTarget = Bun.which('true') ?? '/bin/true';
  const probe = Bun.spawnSync(
    [
      'bwrap',
      '--die-with-parent',
      '--new-session',
      '--unshare-net',
      '--unshare-ipc',
      '--ro-bind',
      '/',
      '/',
      '--dev-bind',
      '/dev',
      '/dev',
      '--proc',
      '/proc',
      '--',
      probeTarget,
    ],
    { stdout: 'ignore', stderr: 'ignore', timeout: 5_000 },
  );
  probed = probe.exitCode === 0;
  return probed;
}

export function bwrapCommand(spec: SandboxSpawnSpec): string[] {
  return [
    'bwrap',
    '--die-with-parent',
    '--new-session',
    '--unshare-net',
    '--unshare-ipc',
    '--ro-bind',
    '/',
    '/',
    '--bind',
    spec.dataDir,
    spec.dataDir,
    '--bind-try',
    tmpdir(),
    tmpdir(),
    '--proc',
    '/proc',
    '--dev',
    '/dev',
  ];
}
