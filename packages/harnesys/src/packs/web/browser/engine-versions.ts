import {
  type EngineSpec,
  engineTargets,
  expectedSha256,
  type OsArch,
  substituteTarget,
} from './engine-catalog.ts';

export interface EngineVersionOption {
  version: string;
  tag: string;
  url: string;
  sha256: string | null;
  supported: boolean;
  recommended: boolean;
}

interface CftEntry {
  version?: string;
}

interface GithubAsset {
  name?: string;
  browser_download_url?: string;
  digest?: string;
}

interface GithubRelease {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GithubAsset[];
}

const DEFAULT_VERSION_LIMIT = 15;
const VERSION_MARKER = '\u0000VERSION\u0000';

function versionedUrl(spec: EngineSpec, tag: string, osArch: OsArch): string {
  const install = spec.install;
  const template = install?.versionedUrlByTarget?.[osArch] ?? install?.versionedUrlTemplate;
  if (template === undefined) {
    throw new Error(`engine ${spec.id}: no versioned url for ${osArch}`);
  }
  return substituteTarget(template.replaceAll('{version}', tag).replaceAll('{tag}', tag), osArch);
}

function assetName(url: string): string {
  return url.split('/').pop() ?? '';
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assetMatcher(spec: EngineSpec, osArch: OsArch): (name: string) => boolean {
  const template = assetName(versionedUrl(spec, VERSION_MARKER, osArch));
  if (!template.includes(VERSION_MARKER)) {
    return (name) => name === template;
  }
  const pattern = template.split(VERSION_MARKER).map(escapeRegExp).join('[0-9][0-9A-Za-z.+-]*');
  const regex = new RegExp(`^${pattern}$`);
  return (name) => regex.test(name);
}

function withPinnedHash(
  spec: EngineSpec,
  osArch: OsArch,
  option: EngineVersionOption,
): EngineVersionOption {
  if (!option.recommended || option.sha256 !== null) {
    return option;
  }
  const pinned = expectedSha256(spec, osArch);
  return pinned === '' ? option : { ...option, sha256: pinned };
}

export function cftVersionOptions(
  raw: unknown,
  spec: EngineSpec,
  osArch: OsArch,
): EngineVersionOption[] {
  const entries = (raw as { versions?: CftEntry[] }).versions ?? [];
  const supported = engineTargets(spec).includes(osArch);
  const options = entries
    .filter((entry): entry is CftEntry & { version: string } => typeof entry.version === 'string')
    .map(
      (entry): EngineVersionOption => ({
        version: entry.version,
        tag: entry.version,
        url: versionedUrl(spec, entry.version, osArch),
        sha256: null,
        supported,
        recommended: entry.version === spec.version,
      }),
    );
  return options
    .slice(-Math.max(1, spec.install?.versions?.limit ?? DEFAULT_VERSION_LIMIT))
    .reverse()
    .map((option) => withPinnedHash(spec, osArch, option));
}

function digestSha256(asset: GithubAsset | undefined): string | null {
  const digest = asset?.digest;
  return typeof digest === 'string' && digest.startsWith('sha256:') ? digest.slice(7) : null;
}

export function githubReleaseOptions(
  raw: unknown,
  spec: EngineSpec,
  osArch: OsArch,
): EngineVersionOption[] {
  const releases = Array.isArray(raw) ? (raw as GithubRelease[]) : [];
  const prefix = spec.install?.versions?.tagPrefix ?? '';
  const matches = assetMatcher(spec, osArch);
  const options: EngineVersionOption[] = [];
  for (const release of releases) {
    if (
      release.draft === true ||
      release.prerelease === true ||
      typeof release.tag_name !== 'string'
    ) {
      continue;
    }
    const tag = release.tag_name;
    if (!tag.startsWith(prefix)) {
      continue;
    }
    const asset = (release.assets ?? []).find((item) => matches(item.name ?? ''));
    options.push({
      version: tag.slice(prefix.length),
      tag,
      url: asset?.browser_download_url ?? versionedUrl(spec, tag, osArch),
      sha256: digestSha256(asset),
      supported: asset !== undefined,
      recommended: tag === `${prefix}${spec.version}`,
    });
    if (options.length >= Math.max(1, spec.install?.versions?.limit ?? DEFAULT_VERSION_LIMIT)) {
      break;
    }
  }
  return options.map((option) => withPinnedHash(spec, osArch, option));
}

export async function listEngineVersions(
  spec: EngineSpec,
  osArch: OsArch,
  fetchFn: typeof fetch = fetch,
): Promise<EngineVersionOption[]> {
  if (spec.install === undefined) {
    return [];
  }
  const source = spec.install.versions;
  if (source === undefined) {
    return [
      withPinnedHash(spec, osArch, {
        version: spec.version,
        tag: spec.version,
        url: versionedUrl(spec, spec.version, osArch),
        sha256: null,
        supported: true,
        recommended: true,
      }),
    ];
  }
  if (source.source === 'chrome-for-testing') {
    const response = await fetchFn(
      'https://googlechromelabs.github.io/chrome-for-testing/known-good-versions.json',
    );
    if (!response.ok) {
      throw new Error(`engine ${spec.id}: version list failed (${response.status})`);
    }
    return cftVersionOptions(await response.json(), spec, osArch);
  }
  const response = await fetchFn(
    `https://api.github.com/repos/${source.repo}/releases?per_page=30`,
    { headers: { accept: 'application/vnd.github+json' } },
  );
  if (!response.ok) {
    throw new Error(`engine ${spec.id}: version list failed (${response.status})`);
  }
  return githubReleaseOptions(await response.json(), spec, osArch);
}
