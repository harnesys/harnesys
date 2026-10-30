import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  seeded: string[];
  skipped: string[];
  added: string[];
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
  const seeded: string[] = [];
  const skipped: string[] = [];
  const added: string[] = [];
  const skills: Record<string, SeedSkillEntry> = {};
  mkdirSync(opts.targetDir, { recursive: true });
  for (const name of bundledSkillNames(opts.bundledRoot)) {
    const source = join(bundledDir, name);
    const dest = join(opts.targetDir, name);
    if (existsSync(dest)) {
      skipped.push(name);
    } else {
      cpSync(source, dest, { recursive: true });
      seeded.push(name);
    }
    if (!previous?.skills[name]) {
      added.push(name);
    }
    skills[name] = { bundledHash: sha256SkillDir(join(source)), seededAt: now };
  }
  writeSeedMarker(opts.targetDir, {
    appVersion: opts.appVersion,
    seededAt: now,
    skills,
  });
  return { seeded, skipped, added };
}
