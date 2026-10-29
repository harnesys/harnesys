import { createHash } from 'node:crypto';

const CONTAINER_NAME_PREFIX = 'harness-ws-';
const CONTAINER_NAME_HASH_CHARS = 16;

export interface WorkspaceRunArgsInput {
  name: string;
  image: string;
  mounts: readonly string[];
  orgId: string;
  workspaceKey: string;
}

export function containerNameOf(orgId: string, workspaceKey: string): string {
  const hash = createHash('sha1').update(`${orgId}|${workspaceKey}`).digest('hex');
  return `${CONTAINER_NAME_PREFIX}${hash.slice(0, CONTAINER_NAME_HASH_CHARS)}`;
}

export function workspaceRunArgs(input: WorkspaceRunArgsInput): string[] {
  return [
    'docker',
    'run',
    '-d',
    '--name',
    input.name,
    '--user',
    `${containerUid()}:${containerGid()}`,
    '--label',
    `harness.org=${input.orgId}`,
    '--label',
    `harness.workspace=${input.workspaceKey}`,
    '--label',
    `harness.image=${input.image}`,
    ...input.mounts.flatMap((mount) => ['-v', `${mount}:${mount}`]),
    input.image,
    'sleep',
    'infinity',
  ];
}

function containerUid(): number {
  return envOverride('HARNESS_CONTAINER_UID') ?? process.getuid?.() ?? 0;
}

function containerGid(): number {
  return envOverride('HARNESS_CONTAINER_GID') ?? process.getgid?.() ?? 0;
}

function envOverride(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}
