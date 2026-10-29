import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ENGINE_CATALOG, type EngineSpec, engineSpecOf } from './engine-catalog.ts';
import { compareVersions, dirSize, listInstalledVersions } from './engine-fs.ts';
import type { HostEngineEntry } from './engine-resolve.ts';
import { enginePaths, readAllowlistAsync } from './engine-store.ts';
import { detectSystemEngine } from './engine-system.ts';

export interface ProbeResult {
  entries: HostEngineEntry[];
  installedPaths: Record<string, string>;
}

function sortedDesc(versions: readonly string[]): string[] {
  return [...versions].sort((a, b) => compareVersions(b, a));
}

function primaryBinary(
  spec: EngineSpec,
  managedVersions: readonly string[],
  binaries: Record<string, string>,
): { version: string; path: string } | null {
  const ordered = [
    spec.version,
    ...sortedDesc(managedVersions),
    ...sortedDesc(Object.keys(binaries)),
  ];
  for (const version of ordered) {
    const path = binaries[version];
    if (path !== undefined) {
      return { version, path };
    }
  }
  return null;
}

async function probeEngine(
  root: string,
  engineId: string,
  enabled: boolean,
  installedPaths: Record<string, string>,
): Promise<HostEngineEntry> {
  const spec = engineSpecOf(engineId);
  if (spec === undefined) {
    return { engineId, installed: false, enabled, broken: true };
  }
  const { engineDir } = enginePaths(root, engineId, spec.version);
  const managed = await listInstalledVersions(engineDir, spec);
  const managedVersions = Object.keys(managed);
  const system = spec.system !== undefined ? await detectSystemEngine(spec) : null;
  const binaries: Record<string, string> = { ...managed };
  if (system !== null && binaries[system.version] === undefined) {
    binaries[system.version] = system.binaryPath;
  }
  const primary = primaryBinary(spec, managedVersions, binaries);
  if (primary === null) {
    const entry: HostEngineEntry = { engineId, installed: false, enabled };
    if (existsSync(engineDir)) {
      entry.broken = true;
    }
    return entry;
  }
  const entry: HostEngineEntry = {
    engineId,
    version: primary.version,
    versions: sortedDesc(Object.keys(binaries)),
    binaries,
    installed: true,
    enabled,
    binaryPath: primary.path,
  };
  if (managedVersions.length > 0) {
    entry.managedVersions = managedVersions;
  }
  if (managedVersions.includes(primary.version)) {
    entry.installedBytes = await dirSize(join(engineDir, primary.version));
  }
  installedPaths[engineId] = primary.path;
  return entry;
}

export async function probeEngines(root: string): Promise<ProbeResult> {
  const allowlist = await readAllowlistAsync(root);
  const entries: HostEngineEntry[] = [];
  const installedPaths: Record<string, string> = {};
  const seen = new Set<string>();
  for (const record of allowlist) {
    seen.add(record.engineId);
    entries.push(await probeEngine(root, record.engineId, record.enabled, installedPaths));
  }
  let dirs: string[] = [];
  try {
    dirs = (await readdir(root, { withFileTypes: true }))
      .filter((item) => item.isDirectory())
      .map((item) => item.name);
  } catch {
    dirs = [];
  }
  for (const dir of dirs) {
    if (dir.startsWith('.') || dir === 'allowlist.json' || seen.has(dir)) {
      continue;
    }
    seen.add(dir);
    entries.push(await probeEngine(root, dir, true, installedPaths));
  }
  for (const spec of ENGINE_CATALOG) {
    if (spec.system === undefined || seen.has(spec.id)) {
      continue;
    }
    const hit = await detectSystemEngine(spec);
    if (hit === null) {
      continue;
    }
    seen.add(spec.id);
    entries.push(await probeEngine(root, spec.id, true, installedPaths));
  }
  return { entries, installedPaths };
}
