import type { SourceVcs } from '@harnesys/contracts';
import type { VcsProbeRaw } from './git-vcs.port.ts';

export function decideSourceVcsUpdate(
  current: SourceVcs | null,
  probe: VcsProbeRaw | { error: true },
): SourceVcs | null | undefined {
  if ('error' in probe) {
    return undefined;
  }
  if (!probe.isGit) {
    return current === null ? undefined : null;
  }
  const next: SourceVcs = {
    engine: 'git',
    remoteUrl: probe.remoteUrl,
    credRef: current?.credRef ?? null,
    defaultBranch: probe.defaultBranch,
    integrationId: current?.integrationId ?? null,
  };
  const same =
    current !== null &&
    current.remoteUrl === next.remoteUrl &&
    current.credRef === next.credRef &&
    current.defaultBranch === next.defaultBranch &&
    current.integrationId === next.integrationId;
  return same ? undefined : next;
}
