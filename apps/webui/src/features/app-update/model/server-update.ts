import { queryOptions } from '@tanstack/react-query';
import { releaseUrl } from './app-update';

const GH_API = 'https://api.github.com';
const REPO = 'harnesys/harnesys';
const PER_PAGE = 10;

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

/** "v1.2.3" -> "1.2.3"; null when the tag is not a semver release. */
export function releaseVersionFromTag(tag: string): string | null {
  const parts = parseVersion(tag);
  return parts ? parts.join('.') : null;
}

export interface ReleaseInfo {
  version: string;
  title: string | null;
  notes: string | null;
  prerelease: boolean;
}

interface GithubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  prerelease?: boolean;
}

function toReleaseInfo(raw: GithubRelease): ReleaseInfo | null {
  const version = typeof raw.tag_name === 'string' ? releaseVersionFromTag(raw.tag_name) : null;
  if (!version) {
    return null;
  }
  return {
    version,
    title: typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : null,
    notes: typeof raw.body === 'string' && raw.body.length > 0 ? raw.body : null,
    prerelease: raw.prerelease === true,
  };
}

/**
 * Recent releases from the GitHub API (CORS-enabled, unlike the release
 * asset URLs). Latest first, oldest trimmed. Server installs (VPS / Docker)
 * cannot self-update from the browser; this only powers "what's new" views.
 */
export async function fetchReleases(): Promise<ReleaseInfo[]> {
  try {
    const response = await fetch(`${GH_API}/repos/${REPO}/releases?per_page=${PER_PAGE}`, {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      return [];
    }
    const body = (await response.json()) as GithubRelease[];
    if (!Array.isArray(body)) {
      return [];
    }
    return body.map(toReleaseInfo).filter((item): item is ReleaseInfo => item !== null);
  } catch {
    return [];
  }
}

export function findRelease(releases: ReleaseInfo[], version: string): ReleaseInfo | null {
  const parts = parseVersion(version);
  const normalized = parts ? parts.join('.') : version;
  return releases.find((item) => item.version === normalized) ?? null;
}

export function releasePageUrl(version: string | null): string {
  return releaseUrl(version);
}

export const releasesQuery = queryOptions({
  queryKey: ['releases'] as const,
  queryFn: fetchReleases,
  staleTime: Number.POSITIVE_INFINITY,
  refetchOnWindowFocus: false,
  retry: false,
});
