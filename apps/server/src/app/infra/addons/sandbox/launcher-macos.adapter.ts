import { existsSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { SandboxSpawnSpec, SpawnedAddonProcess } from './sandbox-launcher.port.ts';
import { SandboxLauncherPort, whitelistedAddonEnv } from './sandbox-launcher.port.ts';
import { spawnPiped } from './spawn-piped.ts';

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';

@Injectable()
export class LauncherMacosAdapter extends SandboxLauncherPort {
  readonly mechanism = 'sandbox-exec';

  available(): boolean {
    return existsSync(SANDBOX_EXEC);
  }

  async spawn(spec: SandboxSpawnSpec): Promise<SpawnedAddonProcess> {
    const profilePath = this.writeProfile(spec);
    const command = [SANDBOX_EXEC, '-f', profilePath, ...spec.command];
    return spawnPiped(command, spec.packageRoot, whitelistedAddonEnv(spec));
  }

  private writeProfile(spec: SandboxSpawnSpec): string {
    const dir = mkdtempSync(join(tmpdir(), 'harnesys-addon-seatbelt-'));
    const profile = seatbeltProfile(spec, process.execPath, tmpdir());
    const path = join(dir, 'profile.sb');
    writeFileSync(path, profile);
    return path;
  }
}

export function seatbeltProfile(spec: SandboxSpawnSpec, bunPath: string, tmpRoot: string): string {
  const sub = (value: string): string => `(subpath ${quote(value)})`;
  const scope = (...entries: string[]): string => `(require-any ${entries.join(' ')})`;
  return [
    '(version 1)',
    '(deny default)',
    '(allow file-read*)',
    `(allow process-exec (literal ${quote(bunPath)}) ${sub(spec.packageRoot)})`,
    '(allow process-fork)',
    `(allow file-write* ${scope(
      sub(spec.dataDir),
      sub(realpathSync(spec.dataDir)),
      sub(tmpRoot),
      sub(realpathSync(tmpRoot)),
    )})`,
    '(allow sysctl-read)',
    '(allow mach-lookup)',
    '(allow iokit-open)',
    '(deny network*)',
  ].join('\n');
}

function quote(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
