import {
  DEFAULT_SHELL_TIMEOUT_MS,
  MAX_SHELL_TIMEOUT_MS,
} from '../../adapters/actions/constants.ts';
import type {
  ProcessJobMode,
  ProcessJobRecord,
  ProcessJobRegistry,
  ProcessJobStatus,
  ProcessJobTarget,
} from '../../domain/process-job.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { gateShellCommand } from './shell-gate.ts';
import { runOnHost } from './shell-host.ts';
import { type ToolTargetInput, tryToRegistryTarget } from './terminal-targets.ts';
export interface ShellOptions {
  timeout?: number;
  allowlist?: readonly string[];
  blocklist?: readonly string[];
}
export interface ShellExecuteInput {
  command: string;
  timeout_ms?: number;
  run_in_background?: boolean;
  block_until_ms?: number;
  open_in_terminal?: boolean;
  target?: ToolTargetInput;
}
export interface ShellBlockingResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}
export interface ShellBackgroundResult {
  jobId: string;
  mode: ProcessJobMode;
  status: ProcessJobStatus;
  title: string;
}
export interface ShellStartErrorResult {
  jobId: '';
  error: string;
}
export type ShellWaitedResult = ShellBlockingResult & {
  jobId: string;
  mode: ProcessJobMode;
  status: ProcessJobStatus;
};
export interface ShellWaitTimeoutResult {
  jobId: string;
  mode: ProcessJobMode;
  status: 'running';
  outputSoFar: string;
  timedOutWaiting: true;
}
export interface ShellBlockingArgs {
  command: string;
  timeoutMs: number;
  ctx: ToolContext;
  ports: ShellPorts;
  mode: ProcessJobMode;
  target?: ProcessJobTarget;
}
export interface ShellBackgroundArgs {
  input: ShellExecuteInput;
  ctx: ToolContext;
  ports: ShellPorts;
  mode: ProcessJobMode;
  target?: ProcessJobTarget;
}
export interface ShellPorts {
  jobs?: ProcessJobRegistry;
  onPtyJob?: (record: ProcessJobRecord) => void;
  resolveOrgId?: () => string | undefined;
  resolveThreadId?: () => string | undefined;
  sshHostApproved?: (host: string) => boolean;
}
export function shell(options: ShellOptions = {}, ports: ShellPorts = {}): ToolDefinition {
  const defaultTimeout = options.timeout ?? DEFAULT_SHELL_TIMEOUT_MS;
  const allowlist = options.allowlist ?? [];
  const blocklist = options.blocklist ?? [];
  return tool('shell', {
    group: 'core',
    description: 'Run a shell command with cwd fixed to the thread workdir.',
    operations: ['process'],
    sideEffect: 'write',
    input: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        timeout_ms: { type: 'integer', minimum: 1 },
        run_in_background: { type: 'boolean' },
        block_until_ms: { type: 'integer', minimum: 0 },
        open_in_terminal: { type: 'boolean' },
        target: {
          type: 'object',
          properties: {
            kind: { type: 'string' },
            host: { type: 'string' },
            user: { type: 'string' },
            port: { type: 'integer' },
            containerId: { type: 'string' },
          },
          required: ['kind'],
        },
      },
      required: ['command'],
    },
    gate: (input, scope) => {
      const parsedGate = input as ShellExecuteInput;
      const host = parsedGate.target?.kind === 'ssh' ? parsedGate.target.host : undefined;
      if (
        host !== undefined &&
        ports.sshHostApproved !== undefined &&
        !ports.sshHostApproved(host)
      ) {
        return { decision: 'ask' as const };
      }
      return gateShellCommand(input, allowlist, blocklist, {
        cwd: scope?.cwd,
        paths: { threadDir: scope?.paths?.threadDir },
      });
    },
    execute(input, ctx) {
      const parsed = input as ShellExecuteInput;
      const timeoutMs = Math.min(
        Math.max(1, parsed.timeout_ms ?? defaultTimeout),
        MAX_SHELL_TIMEOUT_MS,
      );
      const mode: ProcessJobMode = parsed.open_in_terminal === true ? 'pty' : 'pipes';
      const background = parsed.run_in_background === true || parsed.block_until_ms === 0;
      const { target, error } = tryToRegistryTarget(parsed.target);
      if (error !== undefined) {
        return { jobId: '', error };
      }
      const effectiveTarget = target ?? ctx.process;
      if (mode === 'pty' && effectiveTarget?.kind === 'container') {
        const failed: ShellStartErrorResult = {
          jobId: '',
          error: 'container mode does not support open_in_terminal (host profile required)',
        };
        return failed;
      }
      if (!background && parsed.block_until_ms === undefined) {
        return runBlocking({
          command: parsed.command,
          timeoutMs,
          ctx,
          ports,
          mode,
          target: effectiveTarget,
        });
      }
      return runBackground({ input: parsed, ctx, ports, mode, target: effectiveTarget });
    },
  });
}
function requireJobs(jobs: ProcessJobRegistry | undefined): ProcessJobRegistry {
  if (!jobs) {
    throw new Error('shell background jobs unavailable: ProcessJobRegistry not wired');
  }
  return jobs;
}
function waitForJobExit(
  jobs: ProcessJobRegistry,
  id: string,
  waitMs: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let unsub: (() => void) | null = null;
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      unsub?.();
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = (): void => {
      finish();
    };
    const timer = setTimeout(finish, Math.max(0, waitMs));
    unsub = jobs.subscribe(
      id,
      () => undefined,
      () => {
        finish();
      },
    );
    if (unsub === null) {
      finish();
      return;
    }
    if (signal?.aborted === true) {
      finish();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
async function runBlocking(args: ShellBlockingArgs): Promise<ShellBlockingResult> {
  const { command, timeoutMs, ctx, ports, mode, target } = args;
  if (mode === 'pipes' && target === undefined) {
    return runOnHost(command, timeoutMs, ctx.cwd, {
      signal: ctx.signal,
      env: ctx.env,
    });
  }
  const registry = requireJobs(ports.jobs);
  const started = performance.now();
  const orgId = ports.resolveOrgId?.();
  const record = registry.start({
    cwd: ctx.cwd,
    command,
    mode,
    env: ctx.env,
    orgId,
    ...(ports.resolveThreadId?.() === undefined ? {} : { threadId: ports.resolveThreadId?.() }),
    ...(target === undefined ? {} : { process: target }),
  });
  if (mode === 'pty') {
    ports.onPtyJob?.(record);
  }
  await waitForJobExit(registry, record.id, timeoutMs, ctx.signal);
  if (ctx.signal?.aborted === true) {
    registry.kill(record.id);
    throw new Error('shell aborted');
  }
  const final = registry.get(record.id);
  if (!final || final.status === 'running') {
    registry.kill(record.id);
    throw new Error(`shell timed out after ${timeoutMs}ms`);
  }
  return {
    exitCode: final.exitCode,
    stdout: registry.read(record.id)?.text ?? '',
    stderr: '',
    durationMs: Math.round(performance.now() - started),
  };
}
async function runBackground(
  args: ShellBackgroundArgs,
): Promise<
  ShellBackgroundResult | ShellStartErrorResult | ShellWaitedResult | ShellWaitTimeoutResult
> {
  const { input: parsed, ctx, ports, mode, target } = args;
  const registry = requireJobs(ports.jobs);
  const started = performance.now();
  const orgId = ports.resolveOrgId?.();
  let record: ProcessJobRecord;
  try {
    record = registry.start({
      cwd: ctx.cwd,
      command: parsed.command,
      mode,
      env: ctx.env,
      orgId,
      ...(ports.resolveThreadId?.() === undefined ? {} : { threadId: ports.resolveThreadId?.() }),
      ...(target === undefined ? {} : { process: target }),
    });
  } catch (err) {
    return {
      jobId: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
  if (mode === 'pty') {
    ports.onPtyJob?.(record);
  }
  const waitMs = parsed.block_until_ms ?? 0;
  if (!(waitMs > 0)) {
    return { jobId: record.id, mode: record.mode, status: record.status, title: record.title };
  }
  await waitForJobExit(registry, record.id, waitMs, ctx.signal);
  const final = registry.get(record.id);
  const text = registry.read(record.id)?.text ?? '';
  const durationMs = Math.round(performance.now() - started);
  if (final && final.status !== 'running') {
    return {
      jobId: record.id,
      mode: final.mode,
      status: final.status,
      exitCode: final.exitCode,
      stdout: text,
      stderr: '',
      durationMs,
    };
  }
  return {
    jobId: record.id,
    mode: record.mode,
    status: 'running',
    outputSoFar: text,
    timedOutWaiting: true,
  };
}
