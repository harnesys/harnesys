import { expect, test } from 'bun:test';
import type { ProcessJobTarget } from '../../domain/process-job.ts';
import { shell } from '../../packs/shell/shell.ts';
import { dockerProcessArgs } from './docker-process-backend.ts';
import type { ProcessSpawnBackend } from './process-job-backend.ts';
import { createProcessJobRegistry } from './process-job-registry.ts';

test('dockerProcessArgs builds exec argv with user and pidfile shim', () => {
  const argv = dockerProcessArgs({
    containerId: 'c1',
    cwd: '/src/a',
    command: 'ls -la',
    uid: 501,
    gid: 20,
    jobId: 'j1',
  });
  expect(argv.some((v) => v === '--user')).toBe(true);
  expect(argv.join(' ')).toContain('/tmp/.harness-jobs/j1.pid');
  expect(argv).toContain('c1');
  const userAt = argv.indexOf('--user');
  expect(argv[userAt + 1]).toBe('501:20');
});

test('registry routes start and kill through backend for container target', () => {
  const target: ProcessJobTarget = {
    kind: 'container',
    containerId: 'c1',
    orgId: 'o1',
    workspaceKey: 'w1',
  };
  const killed: string[] = [];
  let captured: ProcessJobTarget | undefined;
  const backend: ProcessSpawnBackend = {
    start(input) {
      captured = input.record.target;
      return Bun.spawn(['true'], { stdout: 'ignore', stderr: 'ignore', stdin: 'ignore' });
    },
    kill(record) {
      killed.push(record.id);
    },
  };
  const registry = createProcessJobRegistry(() => backend);
  const record = registry.start({
    cwd: '/tmp/harness-jobs-spec',
    command: 'echo hi',
    mode: 'pipes',
    process: target,
  });
  expect(captured).toEqual(target);
  expect(record.target).toEqual(target);
  expect(registry.kill(record.id)).toBe(true);
  expect(killed).toEqual([record.id]);
  expect(registry.kill(record.id)).toBe(false);
});

test('shell pack rejects open_in_terminal in container mode', async () => {
  const def = shell();
  const result = (await def.execute(
    { command: 'ls', open_in_terminal: true },
    {
      cwd: '/tmp/harness-jobs-spec',
      paths: { allow: [] },
      process: { kind: 'container', containerId: 'c1', orgId: 'o1', workspaceKey: 'w1' },
    },
  )) as { jobId: string; error: string };
  expect(result.jobId).toBe('');
  expect(result.error).toBe(
    'container mode does not support open_in_terminal (host profile required)',
  );
});
