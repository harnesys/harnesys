import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export interface SeedSkillEntry {
  bundledHash: string;
  seededAt: string;
  restoredAt?: string;
}

export interface SeedMarker {
  appVersion: string;
  seededAt: string;
  skills: Record<string, SeedSkillEntry>;
}

export interface SeedResult {
  synced: string[];
  unchanged: string[];
  added: string[];
  removed: string[];
}

export const SEED_MARKER_FILE = '.harnesys-seed.json';

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function listSkillFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), rel);
      } else if (entry.isFile()) {
        files.push(rel);
      }
    }
  };
  walk(root, '');
  return files;
}

export function sha256SkillDir(dir: string): string {
  const hash = createHash('sha256');
  for (const rel of listSkillFiles(dir)) {
    hash.update(rel);
    hash.update('\0');
    hash.update(readFileSync(join(dir, rel)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function readSeedMarker(targetDir: string): SeedMarker | undefined {
  try {
    const raw = readFileSync(join(targetDir, SEED_MARKER_FILE), 'utf8');
    return JSON.parse(raw) as SeedMarker;
  } catch {
    return undefined;
  }
}

export function writeSeedMarker(targetDir: string, marker: SeedMarker): void {
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(join(targetDir, SEED_MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`);
}

export function bundledSkillNames(bundledRoot: string): string[] {
  const bundledDir = join(bundledRoot, 'skills');
  if (!existsSync(bundledDir)) {
    return [];
  }
  return readdirSync(bundledDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(bundledDir, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

export function systemSkillUpdateAvailable(dir: string, marker: SeedMarker, name: string): boolean {
  const entry = marker.skills[name];
  if (!entry) {
    return true;
  }
  const skillDir = join(dir, name);
  if (!existsSync(join(skillDir, 'SKILL.md'))) {
    return true;
  }
  return sha256SkillDir(skillDir) !== entry.bundledHash;
}

export function seedSystemSkills(opts: {
  bundledRoot: string;
  targetDir: string;
  appVersion: string;
}): SeedResult {
  const bundledDir = join(opts.bundledRoot, 'skills');
  const previous = readSeedMarker(opts.targetDir);
  const now = new Date().toISOString();
  const synced: string[] = [];
  const unchanged: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  const skills: Record<string, SeedSkillEntry> = {};
  mkdirSync(opts.targetDir, { recursive: true });
  for (const name of bundledSkillNames(opts.bundledRoot)) {
    const source = join(bundledDir, name);
    const dest = join(opts.targetDir, name);
    const entry = previous?.skills[name];
    const bundledHash = sha256SkillDir(source);
    if (entry === undefined) {
      added.push(name);
    }
    if (existsSync(join(dest, 'SKILL.md')) && sha256SkillDir(dest) === bundledHash) {
      unchanged.push(name);
    } else {
      rmSync(dest, { recursive: true, force: true });
      cpSync(source, dest, { recursive: true });
      synced.push(name);
    }
    skills[name] = {
      bundledHash,
      seededAt: entry?.seededAt ?? now,
      ...(entry?.restoredAt !== undefined ? { restoredAt: entry.restoredAt } : {}),
    };
  }
  for (const name of Object.keys(previous?.skills ?? {})) {
    if (skills[name] !== undefined) {
      continue;
    }
    rmSync(join(opts.targetDir, name), { recursive: true, force: true });
    removed.push(name);
  }
  writeSeedMarker(opts.targetDir, {
    appVersion: opts.appVersion,
    seededAt: now,
    skills,
  });
  return { synced, unchanged, added, removed };
}
