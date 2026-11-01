import path from 'node:path';
export async function runOnHost(
  command: string,
  timeoutMs: number,
  cwd: string,
  opts: {
    signal?: AbortSignal;
    env?: Record<string, string>;
  },
) {
  const { signal, env } = opts;
  const started = performance.now();
  const proc = Bun.spawn(['/bin/sh', '-c', command], {
    cwd: path.resolve(cwd),
    env,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    detached: true,
  });
  let timedOut = false;
  const stop = (): void => {
    killProcessGroup(proc.pid);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, timeoutMs);
  const onAbort = (): void => {
    stop();
  };
  if (signal?.aborted) {
    stop();
  } else {
    signal?.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const [stdoutBuf, stderrBuf, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (signal?.aborted) {
      throw new Error('shell aborted');
    }
    if (timedOut) {
      throw new Error(`shell timed out after ${timeoutMs}ms`);
    }
    return {
      exitCode,
      stdout: stdoutBuf,
      stderr: stderrBuf,
      durationMs: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
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
