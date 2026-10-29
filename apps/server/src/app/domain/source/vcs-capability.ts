import type { SourceAvailability, SourceDistribution, SourceVcs } from '@harnesys/contracts';

interface VcsCarrier {
  vcs: SourceVcs | null;
}

export function hasGitVcs(source: VcsCarrier): boolean {
  return source.vcs !== null;
}

export function hasGitRemote(source: VcsCarrier): boolean {
  return source.vcs?.remoteUrl != null;
}

export type SourceHostAvailabilityReason = 'origin' | 'allowed' | 'excluded' | 'needs-remote';

export interface SourceHostAvailability {
  allowed: boolean;
  reason: SourceHostAvailabilityReason;
}

interface AvailabilitySource {
  distribution: SourceDistribution;
  vcs: SourceVcs | null;
  availability: SourceAvailability;
}

export function sourceHostAvailability(
  source: AvailabilitySource,
  hostId: string,
): SourceHostAvailability {
  if (source.distribution.kind === 'host-bound' && source.distribution.hostId === hostId) {
    return { allowed: true, reason: 'origin' };
  }
  if (source.distribution.kind === 'host-bound' && !hasGitRemote(source)) {
    return { allowed: false, reason: 'needs-remote' };
  }
  if (source.availability.hostIds.includes(hostId)) {
    return { allowed: true, reason: 'allowed' };
  }
  return { allowed: false, reason: 'excluded' };
}
