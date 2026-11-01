import { compileUntil, matchesUntil } from '../../application/process-jobs/read-until.ts';
import {
  argvToShellCommand,
  portForwardArgs,
  type RemoteCopyDirection,
  remoteCopyCommand,
  sshSocketPath,
} from '../../application/process-jobs/ssh-argv.ts';
import { defaultSshRuntimeDir } from '../../application/process-jobs/ssh-process-backend.ts';
import type {
  ProcessJobMode,
  ProcessJobRecord,
  ProcessJobRegistry,
  ProcessJobStatus,
} from '../../domain/process-job.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';

const READ_TIMEOUT_MAX_MS = 30000;
const POLL_SLICE_MS = 250;
export interface ToolTargetInput {
  kind: 'host' | 'container' | 'ssh';
  host?: string;
  user?: string;
  port?: number;
  containerId?: string;
}
export interface TerminalSpawnInput {
  name?: string;
  command: string;
  target?: ToolTargetInput;
  mode?: ProcessJobMode;
  sticky?: boolean;
}
export interface TerminalWriteInput {
  session: string;
  data: string;
}
export interface TerminalReadInput {
  session: string;
  since?: number;
  until?: string;
  timeout_ms?: number;
}
export interface TerminalKillInput {
  session: string;
}
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
export interface TerminalSpawnResult {
  sessionId: string;
  name?: string;
  mode: ProcessJobMode;
  status: ProcessJobStatus;
  reused?: boolean;
  error?: string;
}
export interface TerminalWriteResult {
  sessionId: string;
  ok: boolean;
  status?: ProcessJobStatus;
  error?: string;
}
export interface TerminalReadResult {
  sessionId: string;
  status: ProcessJobStatus | 'missing';
  exitCode: number | null;
  output: string;
  since: number;
  nextSince: number;
  truncated: boolean;
  matched?: boolean;
  error?: string;
}
export interface TerminalKillResult {
  sessionId: string;
  status: ProcessJobStatus | 'missing';
  ok: boolean;
}
export interface TerminalListItem {
  sessionId: string;
  name?: string;
  title: string;
  status: ProcessJobStatus;
  mode: ProcessJobMode;
  target: string;
  createdAt: string;
}
export interface TerminalSessionPorts {
  jobs: ProcessJobRegistry;
  resolveOrgId?: () => string | undefined;
  resolveThreadId?: () => string | undefined;
  sshHostApproved?: (host: string) => boolean;
  onSessionSpawned?: (record: ProcessJobRecord) => void;
}
function describeTarget(target: ProcessJobRecord['target']): string {
  if (target === undefined) {
    return 'host';
  }
  if (target.kind === 'container') {
    return `container:${target.containerId}`;
  }
  if (target.kind === 'ssh') {
    const userPart = target.user === undefined ? '' : `${target.user}@`;
    const portPart = target.port === undefined ? '' : `:${target.port}`;
    return `ssh:${userPart}${target.host}${portPart}`;
  }
  return 'host';
}
export function toRegistryTarget(input: ToolTargetInput | undefined): ProcessJobRecord['target'] {
  if (input === undefined || input.kind === 'host') {
    return undefined;
  }
  if (input.kind === 'container') {
    if (typeof input.containerId !== 'string' || input.containerId.length === 0) {
      throw new Error('container target requires containerId');
    }
    return { kind: 'container', containerId: input.containerId, orgId: '', workspaceKey: '' };
  }
  if (typeof input.host !== 'string' || input.host.length === 0) {
    throw new Error('ssh target requires host');
  }
  return {
    kind: 'ssh',
    host: input.host,
    ...(input.user === undefined ? {} : { user: input.user }),
    ...(input.port === undefined ? {} : { port: input.port }),
  };
}
function sshHostOf(input: ToolTargetInput | undefined): string | undefined {
  return input?.kind === 'ssh' && typeof input.host === 'string' ? input.host : undefined;
}
function sshAskGate(host: string | undefined, ports: TerminalSessionPorts) {
  if (host === undefined) {
    return undefined;
  }
  if (ports.sshHostApproved?.(host)) {
    return undefined;
  }
  return { decision: 'ask' as const };
}
function resolveJob(ports: TerminalSessionPorts, ref: string): ProcessJobRecord | null {
  const orgId = ports.resolveOrgId?.();
  return jobs(ports).getByName(orgId, ref) ?? jobs(ports).get(ref);
}
function jobs(ports: TerminalSessionPorts): ProcessJobRegistry {
  return ports.jobs;
}
function waitForData(jobs: ProcessJobRegistry, id: string, waitMs: number): Promise<void> {
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
      resolve();
    };
    const timer = setTimeout(finish, Math.max(0, waitMs));
    unsub = jobs.subscribe(
      id,
      () => finish(),
      () => finish(),
    );
    if (unsub === null) {
      finish();
    }
  });
}
function toResult(record: ProcessJobRecord): TerminalSpawnResult {
  return {
    sessionId: record.id,
    ...(record.name === undefined ? {} : { name: record.name }),
    mode: record.mode,
    status: record.status,
  };
}
export function terminalTools(ports: TerminalSessionPorts): ToolDefinition[] {
  const spawnGate = (input: unknown) =>
    sshAskGate(sshHostOf((input as TerminalSpawnInput).target), ports);
  const copyAskGate = (input: unknown) => {
    const host = (input as TerminalCopyInput).host;
    return sshAskGate(typeof host === 'string' && host !== '' ? host : undefined, ports);
  };
  return [
    tool('terminal_spawn', {
      group: 'core',
      description:
        'Start a named terminal session (interactive shell, ssh, REPL). Persists across calls; write/read it by name.',
      operations: ['process'],
      sideEffect: 'write',
      input: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          command: { type: 'string' },
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
          mode: { type: 'string' },
          sticky: { type: 'boolean' },
        },
        required: ['command'],
      },
      gate: spawnGate,
      execute(input, ctx) {
        const parsed = input as TerminalSpawnInput;
        const orgId = ports.resolveOrgId?.();
        const name = parsed.name?.trim();
        if (name !== undefined && name !== '') {
          const existing = jobs(ports).getByName(orgId, name);
          if (existing !== null) {
            if (parsed.sticky === true && existing.status === 'running') {
              return { ...toResult(existing), reused: true };
            }
            return {
              sessionId: existing.id,
              mode: existing.mode,
              status: existing.status,
              error: `session name already in use: ${name}`,
            };
          }
        }
        let target: ProcessJobRecord['target'];
        try {
          target = toRegistryTarget(parsed.target ?? ctx.process);
        } catch (err) {
          return {
            sessionId: '',
            error: err instanceof Error ? err.message : String(err),
          };
        }
        if (parsed.mode === 'pty' && target?.kind === 'container') {
          return { sessionId: '', error: 'container mode does not support pty sessions' };
        }
        const record = jobs(ports).start({
          cwd: ctx.cwd,
          command: parsed.command,
          mode: parsed.mode ?? 'pty',
          title: name ?? parsed.command.slice(0, 60),
          env: ctx.env,
          orgId,
          ...(ctx.threadId === undefined ? {} : { threadId: ctx.threadId }),
          ...(name === undefined || name === '' ? {} : { name }),
          origin: 'agent',
          ...(target === undefined ? {} : { process: target }),
        });
        ports.onSessionSpawned?.(record);
        return toResult(record);
      },
    }),
    tool('terminal_write', {
      group: 'core',
      description: 'Write data to the stdin of a terminal session (name or session id).',
      operations: ['process'],
      sideEffect: 'write',
      input: {
        type: 'object',
        properties: {
          session: { type: 'string' },
          data: { type: 'string' },
        },
        required: ['session', 'data'],
      },
      execute(input) {
        const parsed = input as TerminalWriteInput;
        const record = resolveJob(ports, parsed.session);
        if (record === null) {
          return {
            sessionId: parsed.session,
            ok: false,
            error: `unknown session: ${parsed.session}`,
          };
        }
        const ok = jobs(ports).write(record.id, parsed.data);
        return {
          sessionId: record.id,
          ok,
          ...(ok ? {} : { status: record.status }),
        };
      },
    }),
    tool('terminal_read', {
      group: 'core',
      description:
        'Read output of a terminal session or background job. Optional `until` regex blocks (max 30s) until output matches, the session exits, or timeout.',
      operations: ['process'],
      sideEffect: 'read',
      input: {
        type: 'object',
        properties: {
          session: { type: 'string' },
          since: { type: 'integer', minimum: 0 },
          until: { type: 'string' },
          timeout_ms: { type: 'integer', minimum: 0, maximum: READ_TIMEOUT_MAX_MS },
        },
        required: ['session'],
      },
      execute: async (input) => {
        const parsed = input as TerminalReadInput;
        const record = resolveJob(ports, parsed.session);
        if (record === null) {
          return {
            sessionId: parsed.session,
            status: 'missing',
            exitCode: null,
            output: '',
            since: 0,
            nextSince: 0,
            truncated: false,
            error: `unknown session: ${parsed.session}`,
          };
        }
        const since = Math.max(0, parsed.since ?? 0);
        const timeoutMs = Math.min(Math.max(0, parsed.timeout_ms ?? 0), READ_TIMEOUT_MAX_MS);
        const untilRe = parsed.until === undefined ? compileUntil('') : compileUntil(parsed.until);
        if (parsed.until !== undefined && untilRe === null) {
          return {
            sessionId: record.id,
            status: record.status,
            exitCode: record.exitCode,
            output: '',
            since,
            nextSince: since,
            truncated: false,
            error: `invalid until pattern: ${parsed.until}`,
          };
        }
        let read = jobs(ports).read(record.id, { since });
        if (read === null) {
          return {
            sessionId: record.id,
            status: 'missing',
            exitCode: null,
            output: '',
            since,
            nextSince: since,
            truncated: false,
          };
        }
        let status = record.status;
        let exitCode: number | null = record.exitCode;
        let matched = untilRe === null ? undefined : matchesUntil(untilRe, read.text);
        const deadline = Date.now() + timeoutMs;
        while (
          untilRe !== null &&
          matched !== true &&
          status === 'running' &&
          Date.now() < deadline
        ) {
          await waitForData(jobs(ports), record.id, POLL_SLICE_MS);
          const reread = jobs(ports).read(record.id, { since });
          if (reread === null) {
            break;
          }
          read = reread;
          const current = jobs(ports).get(record.id);
          if (current === null) {
            break;
          }
          status = current.status;
          exitCode = current.exitCode;
          matched = matchesUntil(untilRe, read.text);
        }
        const final = jobs(ports).get(record.id);
        return {
          sessionId: record.id,
          status: final?.status ?? status,
          exitCode: final?.exitCode ?? exitCode,
          output: read.text,
          since,
          nextSince: read.nextSince,
          truncated: read.truncated,
          ...(matched === undefined ? {} : { matched }),
        };
      },
    }),
    tool('terminal_kill', {
      group: 'core',
      description: 'Kill a terminal session or background job (name or session id).',
      operations: ['process'],
      sideEffect: 'write',
      input: {
        type: 'object',
        properties: { session: { type: 'string' } },
        required: ['session'],
      },
      execute(input) {
        const parsed = input as TerminalKillInput;
        const record = resolveJob(ports, parsed.session);
        if (record === null) {
          return { sessionId: parsed.session, status: 'missing', ok: false };
        }
        const ok = jobs(ports).kill(record.id);
        return {
          sessionId: record.id,
          status: jobs(ports).get(record.id)?.status ?? record.status,
          ok,
        };
      },
    }),
    tool('terminal_list', {
      group: 'core',
      description: 'List terminal sessions and background jobs of this org.',
      operations: ['process'],
      sideEffect: 'read',
      input: { type: 'object', properties: {} },
      execute() {
        const orgId = ports.resolveOrgId?.();
        const items: TerminalListItem[] = jobs(ports)
          .list({ ...(orgId === undefined ? {} : { orgId }) })
          .map((record) => ({
            sessionId: record.id,
            ...(record.name === undefined ? {} : { name: record.name }),
            title: record.title,
            status: record.status,
            mode: record.mode,
            target: describeTarget(record.target),
            createdAt: record.createdAt,
          }));
        return { sessions: items };
      },
    }),
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
        let target: ProcessJobRecord['target'];
        try {
          target = toRegistryTarget(parsed.target);
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
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
        const record = jobs(ports).start({
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
        const record = jobs(ports).start({
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
