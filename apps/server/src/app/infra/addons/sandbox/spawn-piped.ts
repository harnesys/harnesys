import type { Subprocess } from 'bun';
import { spawn } from 'bun';
import type { ChildHandle, SpawnedStdio } from '../transport/stdio-wiring.ts';
import { ProcessChildHandle } from '../transport/stdio-wiring.ts';

export function spawnPiped(
  command: readonly string[],
  cwd: string,
  env: Record<string, string>,
): { stdio: SpawnedStdio; child: ChildHandle } {
  const proc: Subprocess<'pipe', 'pipe', 'pipe'> = spawn([...command], {
    cwd,
    env,
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
