import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  AddonLockEntry,
  AddonLockFile,
  AddonTrust,
} from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { addonLockPath, assertSafeAddonId, assertSafeVersion } from './addon-paths.ts';

export class AddonLock {
  constructor(private readonly home: string) {}

  read(): AddonLockFile {
    const path = addonLockPath(this.home);
    if (!existsSync(path)) {
      return { entries: [] };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return { entries: [] };
    }
    if (!isLockFile(parsed)) {
      return { entries: [] };
    }
    return parsed;
  }

  write(lock: AddonLockFile): void {
    const path = addonLockPath(this.home);
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    writeFileSync(tmp, `${JSON.stringify(lock, null, 2)}\n`);
    renameSync(tmp, path);
  }

  confirm(entry: AddonLockEntry): boolean {
    const lock = this.read();
    const index = lock.entries.findIndex((candidate) => matches(candidate, entry));
    if (index === -1) {
      this.write({ entries: [...lock.entries, entry] });
      return true;
    }
    const existing = lock.entries[index];
    if (
      !existing ||
      (existing.digest === entry.digest &&
        existing.source === entry.source &&
        existing.trust === entry.trust)
    ) {
      return false;
    }
    const entries = [...lock.entries];
    entries[index] = entry;
    this.write({ entries });
    return true;
  }

  remove(id: string, version: string): boolean {
    const lock = this.read();
    const entries = lock.entries.filter((entry) => !(entry.id === id && entry.version === version));
    if (entries.length === lock.entries.length) {
      return false;
    }
    this.write({ entries });
    return true;
  }

  entry(id: string, version?: string): AddonLockEntry | undefined {
    const lock = this.read();
    return lock.entries.find((entry) =>
      version === undefined ? entry.id === id : entry.id === id && entry.version === version,
    );
  }
}

export interface LockEntryInput {
  id: string;
  version: string;
  digest: string;
  source: string;
  trust: AddonTrust;
  installedAt: string;
}

export function lockEntryFor(input: LockEntryInput): AddonLockEntry {
  assertSafeAddonId(input.id);
  assertSafeVersion(input.version);
  return {
    id: input.id,
    version: input.version,
    digest: input.digest,
    source: input.source,
    trust: input.trust,
    installedAt: input.installedAt,
  };
}

function matches(a: AddonLockEntry, b: AddonLockEntry): boolean {
  return a.id === b.id && a.version === b.version;
}

function isLockFile(value: unknown): value is AddonLockFile {
  if (typeof value !== 'object' || value === null || !('entries' in value)) {
    return false;
  }
  const entries = (value as { entries: unknown }).entries;
  return Array.isArray(entries);
}
