import { describe, expect, test } from 'bun:test';
import type {
  ProcessJobRecord,
  ProcessJobRegistry,
  ProcessJobStatus,
} from '../../domain/process-job.ts';
import { outputTail, probeJobStartup, waitForJobExit } from './job-wait.ts';

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

function fakeRegistry(
  record: ProcessJobRecord,
  text = '',
  onSubscribeExit = false,
): ProcessJobRegistry {
  return {
    start: () => record,
    get: () => record,
    getByName: () => null,
    list: () => [],
    read: () => ({ text, nextSince: text.length, truncated: false }),
    write: () => true,
    rename: () => false,
    resize: () => false,
    subscribe: (_id, _onData, onExit) => {
      if (onSubscribeExit) {
        onExit?.(record.exitCode);
      }
      return () => undefined;
    },
    kill: () => true,
    delete: () => true,
    reapOrg: () => 0,
  };
}

describe('waitForJobExit', () => {
  test('resolves through the exit callback of the subscription', async () => {
    const registry = fakeRegistry(jobRecord('job-1', 'exited', 0), '', true);
    await waitForJobExit(registry, 'job-1', 60_000);
    expect(true).toBe(true);
  });

  test('resolves without waiting when the subscription is unavailable', async () => {
    const registry: ProcessJobRegistry = {
      ...fakeRegistry(jobRecord('job-1', 'exited', 0)),
      subscribe: () => null,
    };
    const started = performance.now();
    await waitForJobExit(registry, 'job-1', 60_000);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test('resolves on timeout when the job keeps running', async () => {
    const registry = fakeRegistry(jobRecord('job-1', 'running', null));
    const started = performance.now();
    await waitForJobExit(registry, 'job-1', 20);
    expect(performance.now() - started).toBeGreaterThanOrEqual(10);
  });
});

describe('probeJobStartup', () => {
  test('returns null while the job is still running', async () => {
    const registry = fakeRegistry(jobRecord('job-1', 'running', null));
    expect(await probeJobStartup(registry, jobRecord('job-1', 'running', null), 10)).toBeNull();
  });

  test('surfaces exit code and output tail once the job exited', async () => {
    const exited = jobRecord('job-1', 'exited', 255);
    const registry = fakeRegistry(
      exited,
      'ssh: connect to host nonexistent.invalid port 22: Operation timed out\n',
    );
    const outcome = await probeJobStartup(registry, exited, 10);
    expect(outcome?.status).toBe('exited');
    expect(outcome?.exitCode).toBe(255);
    expect(outcome?.tail).toContain('nonexistent.invalid');
  });

  test('returns null when the job vanished from the registry', async () => {
    const running = jobRecord('job-1', 'running', null);
    const registry: ProcessJobRegistry = { ...fakeRegistry(running), get: () => null };
    expect(await probeJobStartup(registry, running, 10)).toBeNull();
  });
});

describe('outputTail', () => {
  test('keeps short text trimmed and slices long text from the end', () => {
    expect(outputTail('  hello \n')).toBe('hello');
    const long = `${'a'.repeat(700)}END`;
    const tail = outputTail(long, 100);
    expect(tail.length).toBe(100);
    expect(tail.endsWith('END')).toBe(true);
  });
});
