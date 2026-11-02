import { compileUntil } from '../../application/process-jobs/read-until.ts';
import type {
  ProcessJobMode,
  ProcessJobOrigin,
  ProcessJobRecord,
  ProcessJobRegistry,
  ProcessJobStatus,
  ProcessJobTarget,
} from '../../domain/process-job.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { forwardTools } from './terminal-forward.ts';
import { readSessionOutput } from './terminal-session-io.ts';
import {
  describeTarget,
  sshAskGate,
  sshHostOf,
  type TerminalSessionPorts,
  type ToolTargetInput,
  tryToRegistryTarget,
} from './terminal-targets.ts';

const READ_TIMEOUT_MAX_MS = 30000;
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
  origin: ProcessJobOrigin;
  target: string;
  createdAt: string;
}
function jobs(ports: TerminalSessionPorts): ProcessJobRegistry {
  return ports.jobs;
}
function resolveJob(ports: TerminalSessionPorts, ref: string): ProcessJobRecord | null {
  const orgId = ports.resolveOrgId?.();
  return jobs(ports).getByName(orgId, ref) ?? jobs(ports).get(ref);
}
function namedSessionResult(
  ports: TerminalSessionPorts,
  orgId: string | undefined,
  name: string | undefined,
  sticky: boolean,
): TerminalSpawnResult | null {
  if (name === undefined || name === '') {
    return null;
  }
  const existing = jobs(ports).getByName(orgId, name);
  if (existing === null) {
    return null;
  }
  if (sticky && existing.status === 'running') {
    return { ...toResult(existing), reused: true };
  }
  return {
    sessionId: existing.id,
    mode: existing.mode,
    status: existing.status,
    error: `session name already in use: ${name}`,
  };
}
interface SpawnSessionArgs {
  ports: TerminalSessionPorts;
  parsed: TerminalSpawnInput;
  ctx: ToolContext;
  orgId: string | undefined;
  name: string | undefined;
  target: ProcessJobTarget | undefined;
}
function spawnSession(args: SpawnSessionArgs): ProcessJobRecord {
  const { ports, parsed, ctx, orgId, name, target } = args;
  return ports.jobs.start({
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
  return [
    tool('terminal_spawn', {
      group: 'core',
      description:
        'Start a named terminal session (interactive shell, ssh, REPL). Persists across calls; write/read it by name or session id. The session is shared: it appears in the user sidebar with an "agent" badge, and the user can open it and type in the same shell. This is the intended way to drive long-lived interactive programs instead of mkfifo/background-shell tricks.',
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
        const named = namedSessionResult(ports, orgId, name, parsed.sticky === true);
        if (named !== null) {
          return named;
        }
        const { target, error } = tryToRegistryTarget(parsed.target ?? ctx.process);
        if (error !== undefined) {
          return { sessionId: '', error };
        }
        if (parsed.mode === 'pty' && target?.kind === 'container') {
          return { sessionId: '', error: 'container mode does not support pty sessions' };
        }
        const record = spawnSession({ ports, parsed, ctx, orgId, name, target });
        ports.onSessionSpawned?.(record);
        return toResult(record);
      },
    }),
    tool('terminal_write', {
      group: 'core',
      description:
        'Write raw data to the stdin of a terminal session (name or session id). The stdin is shared with the user, who may also be typing in the same session — do not assume exclusive control and prefer explicit, well-formed input. Control characters: 0x03 (Ctrl+C) interrupts the foreground process, 0x04 (Ctrl+D) signals EOF.',
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
        'Read output of a terminal session or background job. Non-destructive and shared: reading does not consume output and may interleave with the user typing in the same session; page with `since` from the previous `nextSince`. Optional `until` regex blocks (max 30s) until output matches, the session exits, or timeout.',
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
        const state = await readSessionOutput(jobs(ports), record, since, untilRe, timeoutMs);
        if (state === null) {
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
        return {
          sessionId: record.id,
          status: state.status,
          exitCode: state.exitCode,
          output: state.read.text,
          since,
          nextSince: state.read.nextSince,
          truncated: state.read.truncated,
          ...(state.matched === undefined ? {} : { matched: state.matched }),
        };
      },
    }),
    tool('terminal_kill', {
      group: 'core',
      description:
        'Kill a terminal session or background job (name or session id). For a user-opened session this also terminates the shell the user is working in, so prefer terminal_write with 0x03 (Ctrl+C) when only the foreground command should stop.',
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
      description:
        'List terminal sessions and background jobs of this org. Includes sessions opened by the user (origin "user"); read or write them by session id or name to work in the same shell. The user can rename any session from the sidebar, so a session `name` may come from them.',
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
            origin: record.origin ?? 'user',
            target: describeTarget(record.target),
            createdAt: record.createdAt,
          }));
        return { sessions: items };
      },
    }),
    ...forwardTools(ports),
  ];
}
