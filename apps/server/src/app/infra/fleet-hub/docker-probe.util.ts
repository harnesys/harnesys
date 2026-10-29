const DOCKER_PROBE_TIMEOUT_MS = 3_000;
const DOCKER_VERSION_ARGS = ['docker', 'version', '--format', '{{.Server.Version}}'] as const;

let cachedResult: boolean | null = null;

export async function probeDocker(spawnImpl?: typeof Bun.spawn): Promise<boolean> {
  if (cachedResult !== null) {
    return cachedResult;
  }
  cachedResult = await runDockerVersion(spawnImpl ?? Bun.spawn);
  return cachedResult;
}

export function resetDockerProbeCacheForTests(): void {
  cachedResult = null;
}

async function runDockerVersion(spawn: typeof Bun.spawn): Promise<boolean> {
  try {
    const proc = spawn([...DOCKER_VERSION_ARGS], {
      stdout: 'pipe',
      stderr: 'pipe',
      signal: AbortSignal.timeout(DOCKER_PROBE_TIMEOUT_MS),
    });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}
