import type { SourceDistribution, UiVisibility } from '@harnesys/contracts';

export interface VisibilitySource {
  distribution: SourceDistribution;
  uiVisibility: UiVisibility;
}

export function boundHostId(distribution: SourceDistribution): string | null {
  return distribution.kind === 'host-bound' ? distribution.hostId : null;
}

export function isSourceVisibleToSurface(
  source: VisibilitySource,
  surfaceHostId: string | null,
): boolean {
  if (source.uiVisibility === 'org') {
    return true;
  }
  if (surfaceHostId === null || surfaceHostId === '') {
    return false;
  }
  const hostId = boundHostId(source.distribution);
  return hostId !== null && hostId === surfaceHostId;
}

export function filterSourcesByVisibility<T extends VisibilitySource>(
  sources: T[],
  surfaceHostId: string | null,
): T[] {
  return sources.filter((source) => isSourceVisibleToSurface(source, surfaceHostId));
}
