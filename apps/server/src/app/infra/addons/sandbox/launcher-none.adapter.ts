import { Injectable } from '@harnesys/brix';
import type { Subprocess } from 'bun';
import { spawn } from 'bun';
import type { SpawnedStdio } from '../transport/stdio-wiring.ts';
import { ProcessChildHandle } from '../transport/stdio-wiring.ts';
import type { SandboxSpawnSpec, SpawnedAddonProcess } from './sandbox-launcher.port.ts';
import { SandboxLauncherPort, whitelistedAddonEnv } from './sandbox-launcher.port.ts';

@Injectable()
export class LauncherNoneAdapter extends SandboxLauncherPort {
  readonly mechanism = 'none';

  available(): boolean {
    return true;
  }

  async spawn(spec: SandboxSpawnSpec): Promise<SpawnedAddonProcess> {
    const proc: Subprocess<'pipe', 'pipe', 'pipe'> = spawn([...spec.command], {
      cwd: spec.packageRoot,
      env: whitelistedAddonEnv(spec),
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdio: SpawnedStdio = {
      stdin: proc.stdin,
      stdout: proc.stdout,
      stderr: proc.stderr,
    };
    return { stdio, child: new ProcessChildHandle(proc) };
  }
}
