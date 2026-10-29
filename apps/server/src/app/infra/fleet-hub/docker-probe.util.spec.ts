import { beforeEach, describe, expect, test } from 'bun:test';
import { probeDocker, resetDockerProbeCacheForTests } from './docker-probe.util.ts';

interface FakeProcess {
  exited: Promise<number>;
}

const spawnFake = (
  process: FakeProcess | Error,
  onCommand?: (args: string[]) => void,
): typeof Bun.spawn => {
  const impl = (args: string[]): FakeProcess => {
    onCommand?.(args);
    if (process instanceof Error) {
      throw process;
    }
    return process;
  };
  return impl as typeof Bun.spawn;
};

describe('probeDocker', () => {
  beforeEach(() => {
    resetDockerProbeCacheForTests();
  });

  test('docker version exit 0 reports true once and caches the result', async () => {
    const commands: string[][] = [];
    let calls = 0;
    const spawnImpl = spawnFake({ exited: Promise.resolve(0) }, (args) => {
      calls += 1;
      commands.push(args);
    });
    expect(await probeDocker(spawnImpl)).toBe(true);
    expect(await probeDocker(spawnImpl)).toBe(true);
    expect(calls).toBe(1);
    expect(commands[0]?.slice(0, 2)).toEqual(['docker', 'version']);
  });

  test('failure reports false and a cache reset allows probing again', async () => {
    const failing = spawnFake({ exited: Promise.resolve(1) });
    expect(await probeDocker(failing)).toBe(false);
    expect(await probeDocker(failing)).toBe(false);
    resetDockerProbeCacheForTests();
    const throwing = spawnFake(new Error('spawn failed'));
    expect(await probeDocker(throwing)).toBe(false);
    resetDockerProbeCacheForTests();
    const healthy = spawnFake({ exited: Promise.resolve(0) });
    expect(await probeDocker(healthy)).toBe(true);
  });
});
