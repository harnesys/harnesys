import { ENGINE_DEFINITIONS } from './engine-definitions.ts';

export type OsArch = 'macos-x86_64' | 'macos-aarch64' | 'linux-x86_64' | 'linux-aarch64';

export const OS_ARCHES: readonly OsArch[] = [
  'macos-x86_64',
  'macos-aarch64',
  'linux-x86_64',
  'linux-aarch64',
];

export type EngineFormat = 'tar.gz' | 'binary' | 'zip' | 'dmg';

export interface EngineCapabilities {
  screenshots: boolean;
  pdf: boolean;
  stealth: boolean;
  ssrfGuard: boolean;
  markdown: boolean;
  oneShotFetch: boolean;
  headed: boolean;
}

export interface EngineResources {
  ramMb: number;
  diskMb: number;
  coldStartMs: number;
}

export interface EngineInstall {
  format: EngineFormat;
  formatByTarget?: Partial<Record<OsArch, EngineFormat>>;
  urlTemplate?: string;
  urlByTarget?: Partial<Record<OsArch, string>>;
  versionedUrlTemplate?: string;
  versionedUrlByTarget?: Partial<Record<OsArch, string>>;
  sha256: Record<OsArch, string>;
  stealthSha256?: Record<OsArch, string>;
  supportedTargets?: readonly OsArch[];
  binaryPath?: Partial<Record<OsArch, string>>;
  versions?: EngineVersionSource;
}

export interface EngineSystemDetect {
  macosApps: readonly string[];
  linuxBins: readonly string[];
}

export interface EngineVersionSource {
  source: 'chrome-for-testing' | 'github-releases';
  repo?: string;
  tagPrefix?: string;
  limit?: number;
}

export interface EngineSpec {
  id: string;
  label: string;
  version: string;
  license: string;
  capabilities: EngineCapabilities;
  resources: EngineResources;
  install?: EngineInstall;
  system?: EngineSystemDetect;
  stealthBuild?: boolean;
}

export function detectOsArch(): OsArch {
  const os = process.platform === 'darwin' ? 'macos' : 'linux';
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  return `${os}-${arch}` as OsArch;
}

export function osArchParts(osArch: OsArch): { os: string; arch: string } {
  const [os, arch] = osArch.split('-');
  return { os: os ?? '', arch: arch ?? '' };
}

const SUBDIR_BY_TARGET: Record<OsArch, string> = {
  'macos-aarch64': 'mac-arm64',
  'macos-x86_64': 'mac-x64',
  'linux-x86_64': 'linux64',
  'linux-aarch64': 'linux-arm64',
};

export function substituteTarget(template: string, osArch: OsArch): string {
  const { os, arch } = osArchParts(osArch);
  return template
    .replaceAll('{subdir}', SUBDIR_BY_TARGET[osArch])
    .replaceAll('{os}', os)
    .replaceAll('{arch}', arch);
}

export function engineFormatOf(spec: EngineSpec, osArch: OsArch): EngineFormat | undefined {
  const install = spec.install;
  if (install === undefined) {
    return undefined;
  }
  return install.formatByTarget?.[osArch] ?? install.format;
}

export function engineArchiveUrl(spec: EngineSpec, osArch: OsArch): string {
  const install = spec.install;
  const template = install?.urlByTarget?.[osArch] ?? install?.urlTemplate;
  if (template === undefined) {
    throw new Error(`engine ${spec.id}: no download url for ${osArch}`);
  }
  return substituteTarget(template, osArch);
}

export function cftPlatformOf(osArch: OsArch): string {
  return SUBDIR_BY_TARGET[osArch];
}

export function expectedSha256(spec: EngineSpec, osArch: OsArch, stealth = false): string {
  const install = spec.install;
  if (install === undefined) {
    return '';
  }
  if (stealth) {
    return install.stealthSha256?.[osArch] ?? install.sha256[osArch] ?? '';
  }
  return install.sha256[osArch] ?? '';
}

export function engineSpecOf(id: string): EngineSpec | undefined {
  return ENGINE_CATALOG.find((engine) => engine.id === id);
}

export function engineBinaryName(spec: EngineSpec): string {
  return spec.id;
}

export function engineTargets(spec: EngineSpec): readonly OsArch[] {
  if (spec.install === undefined) {
    return [];
  }
  return spec.install.supportedTargets ?? OS_ARCHES;
}

export const ENGINE_CATALOG: readonly EngineSpec[] = ENGINE_DEFINITIONS;
