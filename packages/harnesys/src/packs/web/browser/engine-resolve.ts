import { engineSpecOf } from './engine-catalog.ts';

export interface HostEngineEntry {
  engineId: string;
  version?: string;
  versions?: string[];
  binaries?: Record<string, string>;
  managedVersions?: string[];
  installed: boolean;
  enabled: boolean;
  broken?: boolean;
  binaryPath?: string;
  installedBytes?: number;
}

export type EngineResolution =
  | { status: 'ok'; engineId: string; version?: string }
  | { status: 'missing'; engineId: string; reason?: string }
  | { status: 'none' };

export interface ResolveEngineInput {
  override?: string;
  orgDefault?: string;
  hostEngines: HostEngineEntry[];
}

interface EngineTarget {
  id: string;
  version?: string;
}

export function parseEngineTarget(raw: string | undefined): EngineTarget | null {
  if (raw === undefined || raw === '' || raw === 'auto') {
    return null;
  }
  const at = raw.indexOf('@');
  if (at <= 0) {
    return { id: raw };
  }
  const version = raw.slice(at + 1);
  return version === '' ? { id: raw } : { id: raw.slice(0, at), version };
}

function usable(entry: HostEngineEntry | undefined): entry is HostEngineEntry {
  return entry?.installed === true && entry.enabled === true && entry.broken !== true;
}

function entryHasVersion(entry: HostEngineEntry, version: string): boolean {
  if (entry.binaries?.[version] !== undefined) {
    return true;
  }
  return entry.version === version && entry.binaryPath !== undefined;
}

export function resolveBrowserEngine(input: ResolveEngineInput): EngineResolution {
  const pick = (raw: string | undefined): EngineResolution | null => {
    const target = parseEngineTarget(raw);
    if (target === null) {
      return null;
    }
    if (engineSpecOf(target.id) === undefined) {
      return { status: 'missing', engineId: target.id };
    }
    const entry = input.hostEngines.find((candidate) => candidate.engineId === target.id);
    if (!usable(entry)) {
      return { status: 'missing', engineId: target.id };
    }
    if (target.version !== undefined && !entryHasVersion(entry, target.version)) {
      return {
        status: 'missing',
        engineId: target.id,
        reason: `version ${target.version} is not installed on this host`,
      };
    }
    const version = target.version ?? entry?.version;
    return { status: 'ok', engineId: target.id, version };
  };
  const override = pick(input.override);
  if (override !== null) {
    return override;
  }
  const orgDefault = pick(input.orgDefault);
  if (orgDefault !== null && orgDefault.status === 'ok') {
    return orgDefault;
  }
  const auto = input.hostEngines.find(
    (entry) => usable(entry) && engineSpecOf(entry.engineId) !== undefined,
  );
  return auto !== undefined
    ? { status: 'ok', engineId: auto.engineId, version: auto.version }
    : { status: 'none' };
}
