import type { Subprocess } from 'bun';
import { spawn } from 'bun';
import type { ChildHandle, SpawnedStdio } from '../transport/stdio-wiring.ts';
import { ProcessChildHandle } from '../transport/stdio-wiring.ts';

export type SpawnExtraStdio = 'socket-fd';

export interface SpawnedPipedProcess {
  readonly stdio: SpawnedStdio;
  readonly child: ChildHandle;
  readonly extraFds: readonly (number | null)[];
}

export function spawnPiped(
  command: readonly string[],
  cwd: string,
  env: Record<string, string>,
  extraStdio: readonly SpawnExtraStdio[] = [],
): SpawnedPipedProcess {
  const proc: Subprocess<'pipe', 'pipe', 'pipe'> = spawn([...command], {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe', ...extraStdio],
  });
  const stdio: SpawnedStdio = {
    stdin: proc.stdin,
    stdout: proc.stdout,
    stderr: proc.stderr,
  };
  const extraFds = extraStdio.map((_, index) => proc.stdio[3 + index] ?? null);
  return { stdio, child: new ProcessChildHandle(proc), extraFds };
}
