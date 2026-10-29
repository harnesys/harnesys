import type { ProcessJobRecord, ProcessJobStartInput } from '../../domain/process-job.ts';
export interface ProcessSpawnBackendStartInput extends ProcessJobStartInput {
  record: ProcessJobRecord;
  onData: (chunk: string) => void;
  onExit: (code: number | null) => void;
}
export interface ProcessSpawnBackend {
  start(input: ProcessSpawnBackendStartInput): Bun.Subprocess;
  kill(record: ProcessJobRecord, proc: Bun.Subprocess): void;
}
function defaultShell(): string {
  const fromEnv = process.env.SHELL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh';
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
export function pumpStream(
  stream: ReadableStream<Uint8Array> | null | undefined,
  onChunk: (text: string) => void,
): void {
  if (!stream) {
    return;
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          onChunk(decoder.decode(value, { stream: true }));
        }
      }
      const rest = decoder.decode();
      if (rest) {
        onChunk(rest);
      }
    } catch {
      return;
    } finally {
      reader.releaseLock();
    }
  })();
}
function decodeTerminalData(data: string | Uint8Array): string {
  if (typeof data === 'string') {
    return data;
  }
  return new TextDecoder().decode(data);
}
function spawnHostPty(input: ProcessSpawnBackendStartInput): Bun.Subprocess {
  const shell = defaultShell();
  let argv: string[];
  if (process.platform === 'win32') {
    argv = [shell];
  } else if (!input.command || input.command === shell) {
    argv = [shell, '-l'];
  } else {
    argv = [shell, '-l', '-c', input.command];
  }
  return Bun.spawn(argv, {
    cwd: input.record.cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      ...input.env,
    },
    terminal: {
      cols: input.cols ?? 80,
      rows: input.rows ?? 24,
      name: 'xterm-256color',
      data: (_terminal, data) => {
        input.onData(decodeTerminalData(data));
      },
    },
    onExit: (_subprocess, exitCode) => {
      input.onExit(typeof exitCode === 'number' ? exitCode : null);
    },
  });
}
function spawnHostPipes(input: ProcessSpawnBackendStartInput): Bun.Subprocess {
  const proc = Bun.spawn(['/bin/sh', '-c', input.command], {
    cwd: input.record.cwd,
    env: {
      ...process.env,
      ...input.env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'pipe',
    detached: true,
  });
  pumpStream(proc.stdout, input.onData);
  pumpStream(proc.stderr, input.onData);
  void proc.exited.then((code) => {
    input.onExit(typeof code === 'number' ? code : null);
  });
  return proc;
}
export const hostProcessBackend: ProcessSpawnBackend = {
  start(input): Bun.Subprocess {
    return input.mode === 'pty' ? spawnHostPty(input) : spawnHostPipes(input);
  },
  kill(_record, proc): void {
    if (proc.terminal) {
      if (!proc.killed) {
        proc.kill();
      }
      return;
    }
    killProcessGroup(proc.pid);
  },
};
