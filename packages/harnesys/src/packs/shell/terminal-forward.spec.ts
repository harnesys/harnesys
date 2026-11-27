import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type {
  ProcessJobRecord,
  ProcessJobRegistry,
  ProcessJobStartInput,
  ProcessJobStatus,
} from '../../domain/process-job.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { forwardTools } from './terminal-forward.ts';
import type { TerminalSessionPorts } from './terminal-targets.ts';

interface ToolResult {
  error?: string;
  status?: string;
  sessionId?: string;
  exitCode?: number | null;
  tail?: string;
  spec?: string;
}

function jobRecord(
  id: string,
  status: ProcessJobStatus,
  exitCode: number | null,
): ProcessJobRecord {
  return {
    id,
    cwd: '/run',
    mode: 'pipes',
    title: 'test',
    command: 'true',
    status,
    exitCode,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function makePorts(
  options: {
    exit?: [status: ProcessJobStatus, exitCode: number | null, text?: string];
    subscribable?: boolean;
  } = {},
): { ports: TerminalSessionPorts; starts: ProcessJobStartInput[] } {
  const starts: ProcessJobStartInput[] = [];
  const record = jobRecord('job-1', 'running', null);
  const final =
    options.exit === undefined
      ? null
      : { ...record, status: options.exit[0], exitCode: options.exit[1] };
  const text = options.exit?.[2] ?? '';
  const registry: ProcessJobRegistry = {
    start: (input) => {
      starts.push(input);
      return record;
    },
    get: () => final ?? record,
    getByName: () => null,
    list: () => [],
    read: () => ({ text, nextSince: text.length, truncated: false }),
    write: () => true,
    rename: () => false,
    resize: () => false,
    subscribe: () => (options.subscribable === true ? () => undefined : null),
    kill: () => true,
    delete: () => true,
    reapOrg: () => 0,
  };
  return { ports: { jobs: registry }, starts };
}

function toolOf(tools: ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`tool ${name} not registered`);
  }
  return found;
}

async function run(
  tools: ToolDefinition[],
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  return (await toolOf(tools, name).execute(input, ctx)) as ToolResult;
}

function makeRoot(): { root: string; ctx: ToolContext } {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'harnesys-forward-')));
  return { root, ctx: { cwd: root, paths: { allow: [] } } };
}

const sshTarget = { kind: 'ssh' as const, host: 'nonexistent.invalid', user: 'nobody' };

describe('port_forward', () => {
  test('unknown mode returns a named error instead of crashing', async () => {
    const { ports, starts } = makePorts();
    const tools = forwardTools(ports);
    const ctx: ToolContext = { cwd: '/run', paths: { allow: [] } };
    const result = await run(
      tools,
      'port_forward',
      { mode: '-L', spec: '18080:localhost:80', target: sshTarget },
      ctx,
    );
    expect(result.error).toContain('unknown port forward mode');
    expect(result.error).toContain('local, remote, dynamic');
    expect(starts).toHaveLength(0);
  });

  test('empty spec is rejected before a job starts', async () => {
    const { ports, starts } = makePorts();
    const tools = forwardTools(ports);
    const ctx: ToolContext = { cwd: '/run', paths: { allow: [] } };
    const result = await run(
      tools,
      'port_forward',
      { mode: 'local', spec: '  ', target: sshTarget },
      ctx,
    );
    expect(result.error).toContain('must not be empty');
    expect(starts).toHaveLength(0);
  });

  test('non-ssh target is rejected', async () => {
    const { ports } = makePorts();
    const tools = forwardTools(ports);
    const ctx: ToolContext = { cwd: '/run', paths: { allow: [] } };
    const result = await run(
      tools,
      'port_forward',
      { mode: 'local', spec: '18080:localhost:80', target: { kind: 'host' } },
      ctx,
    );
    expect(result.error).toContain('requires an ssh target');
  });

  test('ssh that exits immediately surfaces exit code and output tail', async () => {
    const { ports } = makePorts({
      exit: [
        'exited',
        255,
        'ssh: connect to host nonexistent.invalid port 22: Could not resolve hostname\n',
      ],
    });
    const tools = forwardTools(ports);
    const ctx: ToolContext = { cwd: '/run', paths: { allow: [] } };
    const result = await run(
      tools,
      'port_forward',
      { mode: 'local', spec: '18080:localhost:80', target: sshTarget },
      ctx,
    );
    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(255);
    expect(result.error).toContain('ssh:nobody@nonexistent.invalid');
    expect(result.error).toContain('255');
    expect(result.tail).toContain('Could not resolve hostname');
    expect(result.spec).toBe('18080:localhost:80');
    expect(result.sessionId).toBe('job-1');
  });

  test('a tunnel that stays up keeps status running', async () => {
    const { ports, starts } = makePorts({ subscribable: true });
    const tools = forwardTools(ports, { startupProbeMs: 10 });
    const ctx: ToolContext = { cwd: '/run', paths: { allow: [] } };
    const result = await run(
      tools,
      'port_forward',
      { mode: 'local', spec: '18080:localhost:80', target: sshTarget },
      ctx,
    );
    expect(result.status).toBe('running');
    expect(result.sessionId).toBe('job-1');
    const command = starts[0]?.command ?? '';
    expect(command).toContain(`'-L'`);
    expect(command).toContain('18080:localhost:80');
  });
});

describe('remote_copy', () => {
  test('push of a relative file path resolves under the run root as tar -C dir -cf - base', async () => {
    const { root, ctx } = makeRoot();
    mkdirSync(path.join(root, 'scratch'));
    writeFileSync(path.join(root, 'scratch', 'a.txt'), 'payload');
    const { ports, starts } = makePorts();
    const tools = forwardTools(ports);
    const result = await run(
      tools,
      'remote_copy',
      {
        direction: 'push',
        local_path: 'scratch/a.txt',
        remote_path: '/srv/app',
        host: 'box.example.com',
      },
      ctx,
    );
    expect(result.status).toBe('running');
    const command = starts[0]?.command ?? '';
    expect(
      command.startsWith(`tar -C '${path.join(root, 'scratch')}' -cf - 'a.txt' | ssh -S `),
    ).toBe(true);
    expect(command).not.toContain(`-cf - .`);
  });

  test('push of a directory keeps the contents shape', async () => {
    const { root, ctx } = makeRoot();
    const { ports, starts } = makePorts();
    const tools = forwardTools(ports);
    await run(
      tools,
      'remote_copy',
      { direction: 'push', local_path: '.', remote_path: '/srv/app', host: 'box.example.com' },
      ctx,
    );
    expect(starts[0]?.command).toContain(`tar -C '${root}' -cf - .`);
  });

  test('pull into a missing directory prepends mkdir -p with the resolved path', async () => {
    const { root, ctx } = makeRoot();
    const { ports, starts } = makePorts();
    const tools = forwardTools(ports);
    await run(
      tools,
      'remote_copy',
      {
        direction: 'pull',
        local_path: 'incoming',
        remote_path: '/srv/app',
        host: 'box.example.com',
      },
      ctx,
    );
    expect(starts[0]?.command).toContain(`mkdir -p '${path.join(root, 'incoming')}' && ssh -S `);
  });

  test('local_path escaping the run root is rejected', async () => {
    const { ctx } = makeRoot();
    const { ports, starts } = makePorts();
    const tools = forwardTools(ports);
    const result = await run(
      tools,
      'remote_copy',
      {
        direction: 'push',
        local_path: '../escape.txt',
        remote_path: '/srv/app',
        host: 'box.example.com',
      },
      ctx,
    );
    expect(result.error).toContain('escapes workdir');
    expect(starts).toHaveLength(0);
  });

  test('push of a missing local path is rejected', async () => {
    const { ctx } = makeRoot();
    const { ports, starts } = makePorts();
    const tools = forwardTools(ports);
    const result = await run(
      tools,
      'remote_copy',
      {
        direction: 'push',
        local_path: 'gone.txt',
        remote_path: '/srv/app',
        host: 'box.example.com',
      },
      ctx,
    );
    expect(result.error).toContain('local path not found');
    expect(starts).toHaveLength(0);
  });

  test('a job that fails immediately returns failed with exit code and tail', async () => {
    const { root, ctx } = makeRoot();
    mkdirSync(path.join(root, 'scratch'));
    writeFileSync(path.join(root, 'scratch', 'a.txt'), 'payload');
    const { ports } = makePorts({
      exit: ['exited', 255, 'ssh: connect to host box.example.com port 22: Operation timed out\n'],
    });
    const tools = forwardTools(ports);
    const result = await run(
      tools,
      'remote_copy',
      {
        direction: 'push',
        local_path: 'scratch/a.txt',
        remote_path: '/srv/app',
        host: 'box.example.com',
      },
      ctx,
    );
    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(255);
    expect(result.error).toContain('remote_copy push');
    expect(result.error).toContain('ssh:box.example.com');
    expect(result.tail).toContain('Operation timed out');
  });

  test('a job that completes immediately returns completed', async () => {
    const { ctx } = makeRoot();
    const { ports } = makePorts({ exit: ['exited', 0, ''] });
    const tools = forwardTools(ports);
    const result = await run(
      tools,
      'remote_copy',
      { direction: 'push', local_path: '.', remote_path: '/srv/app', host: 'box.example.com' },
      ctx,
    );
    expect(result.status).toBe('completed');
    expect(result.exitCode).toBe(0);
    expect(result.error).toBeUndefined();
  });
});
