import { statSync, unlinkSync } from 'node:fs';
import type { ProcessJobRecord } from '../../domain/process-job.ts';
import type { ProcessSpawnBackend } from './process-job-backend.ts';
import { pumpStream } from './process-job-backend.ts';
import {
  execArgs,
  masterArgs,
  masterCheckArgs,
  ptyExecArgs,
  remoteKillArgs,
  type SshEndpointInput,
  sshSocketPath,
} from './ssh-argv.ts';

const MASTER_START_TIMEOUT_MS = 15000;
const SSH_FAILURE_EXIT_CODE = 255;
interface MasterEntry {
  socketPath: string;
  startedAt: number;
}
export interface SshProcessBackendOptions {
  runtimeDir?: string;
}
export function defaultSshRuntimeDir(): string {
  return `${process.env.HOME ?? ''}/.harnesys/run/ssh`;
}
function masterAlive(socketPath: string, target: SshEndpointInput): boolean {
  const proc = Bun.spawnSync(masterCheckArgs(target, socketPath), {
    stdout: 'ignore',
    stderr: 'ignore',
  });
  return proc.exitCode === 0;
}
export function createSshProcessBackend(
  options: SshProcessBackendOptions = {},
): ProcessSpawnBackend {
  const runtimeDir = options.runtimeDir ?? defaultSshRuntimeDir();
  const masters = new Map<string, MasterEntry>();
  function ensureMaster(target: SshEndpointInput): string {
    const socketPath = sshSocketPath(runtimeDir, target);
    const cached = masters.get(socketPath);
    if (cached !== undefined && masterAlive(socketPath, target)) {
      return socketPath;
    }
    masters.delete(socketPath);
    const proc = Bun.spawnSync(masterArgs(target, socketPath), {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: MASTER_START_TIMEOUT_MS,
    });
    if (proc.exitCode !== 0) {
      const stderr = proc.stderr?.toString().trim() ?? '';
      throw new Error(`ssh master failed for ${target.host}: ${stderr || `exit ${proc.exitCode}`}`);
    }
    masters.set(socketPath, { socketPath, startedAt: Date.now() });
    return socketPath;
  }
  return {
    start(input): Bun.Subprocess {
      const target = input.record.target;
      if (target?.kind !== 'ssh') {
        throw new Error('ssh backend requires an ssh target');
      }
      const socketPath = ensureMaster(target);
      if (input.mode === 'pty') {
        return Bun.spawn(
          ptyExecArgs({
            target,
            socketPath,
            command: input.command,
            env: input.env,
          }),
          {
            env: { ...process.env, ...input.env },
            terminal: {
              cols: input.cols ?? 80,
              rows: input.rows ?? 24,
              name: 'xterm-256color',
              data: (_terminal, data) => {
                input.onData(typeof data === 'string' ? data : new TextDecoder().decode(data));
              },
            },
            onExit: (_subprocess, exitCode) => {
              input.onExit(typeof exitCode === 'number' ? exitCode : null);
            },
          },
        );
      }
      const proc = Bun.spawn(
        execArgs({
          target,
          socketPath,
          command: input.command,
          jobId: input.record.id,
          env: input.env,
        }),
        {
          cwd: input.record.cwd,
          stdout: 'pipe',
          stderr: 'pipe',
          stdin: 'pipe',
          detached: true,
        },
      );
      pumpStream(proc.stdout, input.onData);
      pumpStream(proc.stderr, input.onData);
      void proc.exited.then((code) => {
        if (code === SSH_FAILURE_EXIT_CODE) {
          input.onData(`[harnesys] ssh exec failed (ssh exit ${SSH_FAILURE_EXIT_CODE})\n`);
        }
        input.onExit(typeof code === 'number' ? code : null);
      });
      return proc;
    },
    kill(record: ProcessJobRecord, proc: Bun.Subprocess): void {
      const target = record.target;
      if (target?.kind !== 'ssh') {
        return;
      }
      if (record.mode === 'pty') {
        if (!proc.killed) {
          proc.kill();
        }
        return;
      }
      const socketPath = sshSocketPath(runtimeDir, target);
      if (!masterAlive(socketPath, target)) {
        return;
      }
      void Bun.spawn(remoteKillArgs({ target, socketPath, jobId: record.id }), {
        detached: true,
      }).exited;
    },
  };
}
export function sweepSshSockets(runtimeDir: string, maxAgeMs: number): number {
  let removed = 0;
  let entries: string[];
  try {
    entries = [...new Bun.Glob('*.sock').scanSync({ cwd: runtimeDir })];
  } catch {
    return 0;
  }
  const cutoff = Date.now() - maxAgeMs;
  for (const entry of entries) {
    const full = `${runtimeDir}/${entry}`;
    try {
      if (statSync(full).mtimeMs < cutoff) {
        unlinkSync(full);
        removed += 1;
      }
    } catch {}
  }
  return removed;
}
