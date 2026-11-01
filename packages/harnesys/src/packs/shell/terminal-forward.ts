import {
  argvToShellCommand,
  portForwardArgs,
  type RemoteCopyDirection,
  remoteCopyCommand,
  sshSocketPath,
} from '../../application/process-jobs/ssh-argv.ts';
import { defaultSshRuntimeDir } from '../../application/process-jobs/ssh-process-backend.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import type { TerminalSessionPorts } from './terminal-targets.ts';
import {
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
export function forwardTools(ports: TerminalSessionPorts): ToolDefinition[] {
  const copyAskGate = (input: unknown) => {
    const host = (input as TerminalCopyInput).host;
    return sshAskGate(typeof host === 'string' && host !== '' ? host : undefined, ports);
  };
  return [
    tool('port_forward', {
      group: 'core',
      description:
        'Open an SSH port forward as a background job (local -L / remote -R / dynamic -D). Kill it with terminal_kill.',
      operations: ['process'],
      sideEffect: 'write',
      input: {
        type: 'object',
        properties: {
          mode: { type: 'string' },
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
      execute(input, ctx) {
        const parsed = input as TerminalForwardInput;
        const { target, error } = tryToRegistryTarget(parsed.target);
        if (error !== undefined) {
          return { error };
        }
        if (target?.kind !== 'ssh') {
          return { error: 'port_forward requires an ssh target' };
        }
        const command = argvToShellCommand(
          portForwardArgs({
            target,
            socketPath: sshSocketPath(defaultSshRuntimeDir(), target),
            spec: parsed.spec,
            mode: parsed.mode,
          }),
        );
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
        return { sessionId: record.id, status: record.status, spec: parsed.spec };
      },
    }),
    tool('remote_copy', {
      group: 'core',
      description:
        'Copy files over SSH via tar pipe: push local_path → remote host:remote_path, or pull. Runs as a background job; read it with terminal_read.',
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
      execute(input, ctx) {
        const parsed = input as TerminalCopyInput;
        if (parsed.direction !== 'push' && parsed.direction !== 'pull') {
          return { error: 'direction must be push or pull' };
        }
        const target = {
          kind: 'ssh' as const,
          host: parsed.host,
          ...(parsed.user === undefined ? {} : { user: parsed.user }),
          ...(parsed.port === undefined ? {} : { port: parsed.port }),
        };
        const command = remoteCopyCommand({
          target,
          socketPath: sshSocketPath(defaultSshRuntimeDir(), target),
          direction: parsed.direction,
          localPath: parsed.local_path,
          remotePath: parsed.remote_path,
        });
        const orgId = ports.resolveOrgId?.();
        const record = ports.jobs.start({
          cwd: ctx.cwd,
          command,
          mode: 'pipes',
          title: `remote_copy ${parsed.direction} ${parsed.local_path}`,
          env: ctx.env,
          orgId,
          ...(ctx.threadId === undefined ? {} : { threadId: ctx.threadId }),
          origin: 'agent',
          process: { kind: 'host' },
        });
        ports.onSessionSpawned?.(record);
        return { sessionId: record.id, status: record.status };
      },
    }),
  ];
}
