import { isNewerVersion, parseVersion } from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';
import { releaseUrl } from './app-update';

export { isNewerVersion, parseVersion };

const GH_API = 'https://api.github.com';
const REPO = 'harnesys/harnesys';
const PER_PAGE = 10;

/** First meaningful markdown line, flattened to a one-line preview for toasts. */
export function previewNotes(notes: string | null, max = 160): string | null {
  if (!notes) {
    return null;
  }
  const line = notes
    .split('\n')
    .map((row) => row.trim())
    .find((row) => row.length > 0 && !/^[#>*-]/.test(row) && !/^\d+\./.test(row));
  if (!line) {
    return null;
  }
  const flat = line
    .replace(/[*`_[]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
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
