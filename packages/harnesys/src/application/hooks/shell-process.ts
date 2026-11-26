import path from 'node:path';

export type HookKillSource = 'timeout' | 'abort' | 'close';

export interface HookProcessEntry {
  pid: number;
  kill(source: HookKillSource): void;
  done: Promise<unknown>;
}

export interface HookProcessRegistry {
  add(entry: HookProcessEntry): void;
  remove(entry: HookProcessEntry): void;
}

export type ShellProcessShell = 'bash' | 'zsh' | 'sh' | 'powershell';

export interface ShellProcessInput {
  command: string;
  argv?: string[];
  shell?: ShellProcessShell;
  cwd: string;
  env: Record<string, string>;
  stdin?: string;
  timeoutS: number;
  signal?: AbortSignal;
  registry?: HookProcessRegistry;
}

export interface ShellProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
  spawnError?: string;
  durationMs: number;
}

const BASH_FAMILY = new Set(['bash', 'zsh', 'sh']);

export async function runShellProcess(input: ShellProcessInput): Promise<ShellProcessResult> {
  const startedAt = Date.now();
  let proc: Bun.Subprocess<'pipe', 'pipe', 'pipe'>;
  try {
    proc = spawn(input);
  } catch (error) {
    return {
      exitCode: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      aborted: false,
      spawnError: errorMessage(error),
      durationMs: Date.now() - startedAt,
    };
  }
  let killSource: HookKillSource | undefined;
  const kill = (source: HookKillSource): void => {
    killSource = source;
    killProcessGroup(proc.pid);
  };
  const entry: HookProcessEntry = { pid: proc.pid, kill, done: proc.exited };
  input.registry?.add(entry);
  const onAbort = (): void => kill('abort');
  input.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => kill('timeout'), input.timeoutS * 1000);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      writeStdinAndAwaitExit(proc, input.stdin),
    ]);
    return {
      exitCode,
      stdout,
      stderr,
      timedOut: killSource === 'timeout',
      aborted: killSource === 'abort' || killSource === 'close',
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onAbort);
    input.registry?.remove(entry);
    await proc.exited;
  }
}

function spawn(input: ShellProcessInput): Bun.Subprocess<'pipe', 'pipe', 'pipe'> {
  const base = {
    cwd: input.cwd,
    env: input.env,
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
    stdin: 'pipe' as const,
    detached: true,
  };
  if (input.argv !== undefined) {
    return spawnArgv(input.argv, base);
  }
  return spawnShell(input.shell ?? 'bash', input.command, base);
}

interface SpawnBase {
  cwd: string;
  env: Record<string, string>;
  stdout: 'pipe';
  stderr: 'pipe';
  stdin: 'pipe';
  detached: boolean;
}

function spawnShell(
  shell: ShellProcessShell,
  command: string,
  options: SpawnBase,
): Bun.Subprocess<'pipe', 'pipe', 'pipe'> {
  if (shell === 'powershell') {
    return Bun.spawn(['pwsh', '-NoProfile', '-Command', command], options);
  }
  if (shell === 'bash') {
    return Bun.spawn([bashBin(), '-c', command], options);
  }
  return Bun.spawn([shell, '-c', command], options);
}

export function bashBin(): string {
  return Bun.which('bash') ?? '/bin/bash';
}

export function resolveBashBin(): string {
  const shell = process.env.SHELL;
  if (shell !== undefined && shell.length > 0) {
    const base = path.basename(shell);
    if (BASH_FAMILY.has(base)) {
      return shell;
    }
  }
  return 'bash';
}

function spawnArgv(argv: string[], options: SpawnBase): Bun.Subprocess<'pipe', 'pipe', 'pipe'> {
  try {
    return Bun.spawn(argv, options);
  } catch (error) {
    if (!isExecFormatError(error)) {
      throw error;
    }
    return Bun.spawn([resolveBashBin(), ...argv], options);
  }
}

function isExecFormatError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOEXEC' || code === 'EACCES' || error.message.startsWith('ENOEXEC');
}

async function writeStdinAndAwaitExit(
  proc: Bun.Subprocess<'pipe', 'pipe', 'pipe'>,
  stdin: string | undefined,
): Promise<number | null> {
  try {
    if (stdin !== undefined && stdin.length > 0) {
      proc.stdin.write(stdin);
    }
    await proc.stdin.end();
  } catch {}
  return await proc.exited;
}

function killProcessGroup(pid: number): void {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      return;
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : String(error);
}
