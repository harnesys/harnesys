import { queryOptions } from '@tanstack/react-query';
import { releaseUrl } from './app-update';

const LATEST_JSON_URL = 'https://github.com/harnesys/harnesys/releases/latest/download/latest.json';

/** Numeric semver triple of "v1.2.3" / "1.2.3"; null when it does not parse. */
export function parseVersion(tag: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = parseVersion(current);
  const latestParts = parseVersion(latest);
  if (!currentParts || !latestParts) {
    return false;
  }
  return (
    latestParts[0] > currentParts[0] ||
    (latestParts[0] === currentParts[0] && latestParts[1] > currentParts[1]) ||
    (latestParts[0] === currentParts[0] &&
      latestParts[1] === currentParts[1] &&
      latestParts[2] > currentParts[2])
  );
}

interface LatestRelease {
  version: string;
}

/**
 * One-off fetch of the Tauri `latest.json` published with each release.
 * Server installs (VPS / Docker) have no in-app updater; installation stays
 * with the operator (`docker compose pull` / `harnesys update`).
 */
export async function fetchLatestReleaseVersion(): Promise<string | null> {
  try {
    const response = await fetch(LATEST_JSON_URL, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as Partial<LatestRelease>;
    return typeof body.version === 'string' ? body.version : null;
  } catch {
    return null;
  }
}

export function releasePageUrl(version: string | null): string {
  return releaseUrl(version);
}

export const latestReleaseQuery = queryOptions({
  queryKey: ['latest-release'] as const,
  queryFn: fetchLatestReleaseVersion,
  staleTime: Number.POSITIVE_INFINITY,
  refetchOnWindowFocus: false,
  retry: false,
});
