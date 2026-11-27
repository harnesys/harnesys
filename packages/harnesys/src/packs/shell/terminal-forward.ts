import { statSync } from 'node:fs';
import { resolveFileTarget } from '../../adapters/actions/file-guard.ts';
import {
  JOB_STARTUP_PROBE_MS,
  type JobStartupOutcome,
  probeJobStartup,
} from '../../application/process-jobs/job-wait.ts';
import {
  argvToShellCommand,
  portForwardArgs,
  type RemoteCopyDirection,
  type RemoteCopyLocal,
  remoteCopyCommand,
  sshSocketPath,
} from '../../application/process-jobs/ssh-argv.ts';
import { defaultSshRuntimeDir } from '../../application/process-jobs/ssh-process-backend.ts';
import type { ProcessJobRecord } from '../../domain/process-job.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import type { TerminalSessionPorts } from './terminal-targets.ts';
import {
  describeTarget,
  sshAskGate,
  sshHostOf,
  type ToolTargetInput,
  tryToRegistryTarget,
} from './terminal-targets.ts';
export interface TerminalForwardInput {
  mode: 'local' | 'remote' | 'dynamic';
  spec: string;
  target?: ToolTargetInput;
}
export interface TerminalCopyInput {
  direction: RemoteCopyDirection;
  local_path: string;
  remote_path: string;
  host: string;
  user?: string;
  port?: number;
}
export interface ForwardToolsOptions {
  startupProbeMs?: number;
}
function executionError(err: unknown): { error: string } {
  return { error: err instanceof Error ? err.message : String(err) };
}
function tailDetail(tail: string): string {
  return tail.length === 0 ? '' : `: ${tail}`;
}
function resolveCopyLocal(
  ctx: ToolContext,
  target: string,
  direction: RemoteCopyDirection,
): RemoteCopyLocal {
  const canonical = resolveFileTarget(ctx, target, direction === 'push' ? 'read' : 'edit', {});
  const stats = statSync(canonical, { throwIfNoEntry: false });
  if (direction === 'push') {
    if (stats === undefined) {
      throw new Error(`local path not found: ${canonical}`);
    }
    if (stats.isFile()) {
      return { path: canonical, kind: 'file' };
    }
    if (stats.isDirectory()) {
      return { path: canonical, kind: 'directory' };
    }
    throw new Error(`local path is neither a file nor a directory: ${canonical}`);
  }
  if (stats === undefined) {
    return { path: canonical, kind: 'missing' };
  }
  if (stats.isDirectory()) {
    return { path: canonical, kind: 'directory' };
  }
  throw new Error(`remote_copy pull requires a directory target: ${canonical}`);
}
function copyTarget(input: TerminalCopyInput): {
  kind: 'ssh';
  host: string;
  user?: string;
  port?: number;
} {
  return {
    kind: 'ssh',
    host: input.host,
    ...(input.user === undefined ? {} : { user: input.user }),
    ...(input.port === undefined ? {} : { port: input.port }),
  };
}
function copyOutcome(
  direction: RemoteCopyDirection,
  target: { kind: 'ssh'; host: string; user?: string; port?: number },
  local: RemoteCopyLocal,
  record: ProcessJobRecord,
  startup: JobStartupOutcome,
): object {
  if (startup.status === 'exited' && startup.exitCode === 0) {
    return { sessionId: record.id, status: 'completed' as const, exitCode: 0, tail: startup.tail };
  }
  const preposition = direction === 'push' ? 'to' : 'from';
  return {
    sessionId: record.id,
    status: 'failed' as const,
    exitCode: startup.exitCode,
    tail: startup.tail,
    error: `remote_copy ${direction} of ${local.path} ${preposition} ${describeTarget(target)} exited with code ${String(startup.exitCode)}${tailDetail(startup.tail)}`,
  };
}
export function forwardTools(
  ports: TerminalSessionPorts,
  options: ForwardToolsOptions = {},
): ToolDefinition[] {
  const copyAskGate = (input: unknown) => {
    const host = (input as TerminalCopyInput).host;
    return sshAskGate(typeof host === 'string' && host !== '' ? host : undefined, ports);
  };
  const probeMs = () => options.startupProbeMs ?? JOB_STARTUP_PROBE_MS;
  return [
    tool('port_forward', {
      group: 'core',
      description:
        'Open an SSH port forward as a background job: mode local (-L), remote (-R) or dynamic (-D), spec is an ssh forward spec like "18080:localhost:80". While the tunnel stays up the result reports status running; if ssh exits within the first seconds (bad host, auth failure, connect refused) the result reports status failed with exitCode and an output tail. Kill it with terminal_kill.',
      operations: ['process'],
      sideEffect: 'write',
      input: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['local', 'remote', 'dynamic'] },
          spec: { type: 'string' },
          target: {
            type: 'object',
            properties: {
              kind: { type: 'string' },
              host: { type: 'string' },
              user: { type: 'string' },
              port: { type: 'integer' },
            },
            required: ['kind'],
          },
        },
        required: ['mode', 'spec', 'target'],
      },
      gate: (input) => sshAskGate(sshHostOf((input as TerminalForwardInput).target), ports),
      async execute(input, ctx) {
        const parsed = input as TerminalForwardInput;
        const { target, error } = tryToRegistryTarget(parsed.target);
        if (error !== undefined) {
          return { error };
        }
        if (target?.kind !== 'ssh') {
          return { error: 'port_forward requires an ssh target' };
        }
        if (parsed.spec.trim().length === 0) {
          return { error: 'port_forward spec must not be empty' };
        }
        let command: string;
        try {
          command = argvToShellCommand(
            portForwardArgs({
              target,
              socketPath: sshSocketPath(defaultSshRuntimeDir(), target),
              spec: parsed.spec,
              mode: parsed.mode,
            }),
          );
        } catch (err) {
          return executionError(err);
        }
        const orgId = ports.resolveOrgId?.();
        const record = ports.jobs.start({
          cwd: ctx.cwd,
          command,
          mode: 'pipes',
          title: `port-forward ${parsed.mode} ${parsed.spec}`,
          env: ctx.env,
          orgId,
          ...(ctx.threadId === undefined ? {} : { threadId: ctx.threadId }),
          origin: 'agent',
          process: { kind: 'host' },
        });
        ports.onSessionSpawned?.(record);
        const startup = await probeJobStartup(ports.jobs, record, probeMs(), ctx.signal);
        if (startup === null) {
          return { sessionId: record.id, status: record.status, spec: parsed.spec };
        }
        return {
          sessionId: record.id,
          status: 'failed' as const,
          exitCode: startup.exitCode,
          tail: startup.tail,
          spec: parsed.spec,
          error: `port_forward to ${describeTarget(target)} exited with code ${String(startup.exitCode)} before the tunnel came up${tailDetail(startup.tail)}`,
        };
      },
    }),
    tool('remote_copy', {
      group: 'core',
      description:
        'Copy files over SSH via a tar pipe, running as a background job. local_path resolves relative to the run workdir and must stay inside the allowed file roots. push: a file lands as remote_path/<basename>, a directory sends its contents into remote_path. pull: remote_path (a remote directory) is extracted into local_path, creating the local directory when missing. A job that finishes within the first seconds returns completed or failed with exitCode and an output tail; while still running, read it later with terminal_read.',
      operations: ['process'],
      sideEffect: 'write',
      input: {
        type: 'object',
        properties: {
          direction: { type: 'string' },
          local_path: { type: 'string' },
          remote_path: { type: 'string' },
          host: { type: 'string' },
          user: { type: 'string' },
          port: { type: 'integer' },
        },
        required: ['direction', 'local_path', 'remote_path', 'host'],
      },
      gate: copyAskGate,
      async execute(input, ctx) {
        const parsed = input as TerminalCopyInput;
        if (parsed.direction !== 'push' && parsed.direction !== 'pull') {
          return { error: 'direction must be push or pull' };
        }
        if (parsed.remote_path.trim().length === 0) {
          return { error: 'remote_path must not be empty' };
        }
        const target = copyTarget(parsed);
        let local: RemoteCopyLocal;
        let command: string;
        try {
          local = resolveCopyLocal(ctx, parsed.local_path, parsed.direction);
          command = remoteCopyCommand({
            target,
            socketPath: sshSocketPath(defaultSshRuntimeDir(), target),
            direction: parsed.direction,
            local,
            remotePath: parsed.remote_path,
          });
        } catch (err) {
          return executionError(err);
        }
        const orgId = ports.resolveOrgId?.();
        const record = ports.jobs.start({
          cwd: ctx.cwd,
          command,
          mode: 'pipes',
          title: `remote_copy ${parsed.direction} ${local.path}`,
          env: ctx.env,
          orgId,
          ...(ctx.threadId === undefined ? {} : { threadId: ctx.threadId }),
          origin: 'agent',
          process: { kind: 'host' },
        });
        ports.onSessionSpawned?.(record);
        const startup = await probeJobStartup(ports.jobs, record, probeMs(), ctx.signal);
        if (startup === null) {
          return { sessionId: record.id, status: record.status };
        }
        return copyOutcome(parsed.direction, target, local, record, startup);
      },
    }),
  ];
}
