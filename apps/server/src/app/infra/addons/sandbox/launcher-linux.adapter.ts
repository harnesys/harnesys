import { tmpdir } from 'node:os';
import { Injectable } from '@harnesys/brix';
import type { SandboxSpawnSpec, SpawnedAddonProcess } from './sandbox-launcher.port.ts';
import { SandboxLauncherPort, whitelistedAddonEnv } from './sandbox-launcher.port.ts';
import { spawnPiped } from './spawn-piped.ts';

@Injectable()
export class LauncherLinuxAdapter extends SandboxLauncherPort {
  readonly mechanism = 'bubblewrap';

  available(): boolean {
    return Bun.which('bwrap') !== null;
  }

  async spawn(spec: SandboxSpawnSpec): Promise<SpawnedAddonProcess> {
    const command = [...bwrapCommand(spec), ...spec.command];
    return spawnPiped(command, spec.packageRoot, whitelistedAddonEnv(spec));
  }
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
    '--dev-bind',
    '/dev',
    '/dev',
    '--proc',
    '/proc',
    '--devtmpfs',
    '/dev',
  ];
}
