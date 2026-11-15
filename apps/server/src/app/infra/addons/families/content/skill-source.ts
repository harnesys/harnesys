import type { Dirent } from 'node:fs';
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import type { Logger } from '@harnesys/brix';
import { parseSkillFile } from 'harnesys';
import { sanitizeSkillName } from '../../../../domain/skills/skill-name.ts';

export const ADDON_SKILL_MD = 'SKILL.md';
export const ADDON_SKILL_MAX_FILE_BYTES = 256 * 1024;
export const ADDON_SKILL_MAX_TOTAL_BYTES = 1024 * 1024;
export const ADDON_SKILL_MAX_FILES = 32;

const SKILL_DIR_MODE = 0o700;

export interface AddonSkillLocation {
  /** Absolute descriptor target: the skill directory or a single markdown file. */
  source: string;
  /** Absolute directory holding SKILL.md. */
  dir: string;
  /** Absolute path of SKILL.md (or the legacy single file). */
  skillFile: string;
  mode: 'dir' | 'file';
}

export type AddonSkillPathResolution =
  | { ok: true; location: AddonSkillLocation }
  | { ok: false; reason: string };

export interface AddonSkillDocument {
  description?: string;
  whenToUse?: string;
  body: string;
}

export interface AddonSkillSource {
  name: string;
  description: string;
  whenToUse?: string;
  body: string;
  files: Record<string, string>;
}

export type AddonSkillLoad = { ok: true; skill: AddonSkillSource } | { ok: false; reason: string };

export type AddonSkillFilesResult =
  | { ok: true; files: Record<string, string>; skipped: string[] }
  | { ok: false; reason: string };

/** Single source of the namespaced org/pack skill name for an addon contribution. */
export function addonSkillName(addonId: string, skillId: string): string {
  return sanitizeSkillName(`addon-${addonId}-${skillId}`);
}

/** Resolves a descriptor `path` against the installed package root, refusing escapes. */
export function resolveContentSkillPath(
  root: string,
  relativePath: string,
): AddonSkillPathResolution {
  if (relativePath.length === 0 || isAbsolute(relativePath)) {
    return { ok: false, reason: `path must be relative: ${relativePath}` };
  }
  const abs = resolve(root, relativePath);
  if (abs !== root && !abs.startsWith(root + sep)) {
    return { ok: false, reason: `path escapes the package root: ${relativePath}` };
  }
  return locateSkillSource(abs);
}

/** Classifies an absolute source path as a skill directory or a legacy single file. */
export function locateSkillSource(absolutePath: string): AddonSkillPathResolution {
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(absolutePath);
  } catch {
    return { ok: false, reason: `path not found: ${absolutePath}` };
  }
  if (stat.isSymbolicLink()) {
    return { ok: false, reason: `path is a symlink: ${absolutePath}` };
  }
  if (stat.isDirectory()) {
    const skillFile = join(absolutePath, ADDON_SKILL_MD);
    let skillStat: ReturnType<typeof lstatSync>;
    try {
      skillStat = lstatSync(skillFile);
    } catch {
      return { ok: false, reason: `missing ${ADDON_SKILL_MD} in ${absolutePath}` };
    }
    if (!skillStat.isFile()) {
      return { ok: false, reason: `${ADDON_SKILL_MD} is not a file in ${absolutePath}` };
    }
    return {
      ok: true,
      location: { source: absolutePath, dir: absolutePath, skillFile, mode: 'dir' },
    };
  }
  if (stat.isFile()) {
    return {
      ok: true,
      location: {
        source: absolutePath,
        dir: dirname(absolutePath),
        skillFile: absolutePath,
        mode: 'file',
      },
    };
  }
  return { ok: false, reason: `not a file or directory: ${absolutePath}` };
}

/**
 * Reads frontmatter through the shared `parseSkillFile`. A file that is not a
 * valid skill document (missing frontmatter, malformed YAML, empty body) still
 * yields its body so the contribution degrades to the descriptor title.
 */
export function parseAddonSkillDocument(raw: string): AddonSkillDocument {
  try {
    const doc = parseSkillFile(raw, ADDON_SKILL_MD);
    return {
      description: doc.description,
      ...(doc.whenToUse !== undefined ? { whenToUse: doc.whenToUse } : {}),
      body: doc.instructions,
    };
  } catch {
    return { body: stripFrontmatter(raw).trim() };
  }
}

interface SkillFileCandidate {
  rel: string;
  abs: string;
}

/** Collects supporting files (everything but SKILL.md) with the size and count caps applied. */
export function collectAddonSkillFiles(dir: string): AddonSkillFilesResult {
  const { candidates, skipped } = listSupportingFiles(dir);
  if (candidates.length > ADDON_SKILL_MAX_FILES) {
    return { ok: false, reason: `more than ${ADDON_SKILL_MAX_FILES} supporting files` };
  }
  const files: Record<string, string> = {};
  let total = 0;
  for (const candidate of candidates) {
    const bytes = statSync(candidate.abs).size;
    if (bytes > ADDON_SKILL_MAX_FILE_BYTES) {
      return { ok: false, reason: `${candidate.rel} exceeds ${ADDON_SKILL_MAX_FILE_BYTES} bytes` };
    }
    total += bytes;
    if (total > ADDON_SKILL_MAX_TOTAL_BYTES) {
      return { ok: false, reason: `supporting files exceed ${ADDON_SKILL_MAX_TOTAL_BYTES} bytes` };
    }
    files[candidate.rel] = readFileSync(candidate.abs, 'utf8');
  }
  return { ok: true, files, skipped };
}

interface CollectWalk {
  candidates: SkillFileCandidate[];
  skipped: string[];
  pending: string[];
}

function listSupportingFiles(dir: string): {
  candidates: SkillFileCandidate[];
  skipped: string[];
} {
  const walk: CollectWalk = { candidates: [], skipped: [], pending: [''] };
  while (walk.pending.length > 0) {
    const prefix = walk.pending.pop();
    if (prefix === undefined) {
      break;
    }
    visitDirectory(dir, prefix, walk);
  }
  return { candidates: walk.candidates, skipped: walk.skipped };
}

function visitDirectory(dir: string, prefix: string, walk: CollectWalk): void {
  const abs = prefix === '' ? dir : join(dir, prefix);
  for (const entry of readDirEntries(abs)) {
    visitEntry(dir, prefix, entry, walk);
  }
}

function visitEntry(dir: string, prefix: string, entry: Dirent, walk: CollectWalk): void {
  const rel = relPathOf(prefix, entry.name);
  if (entry.isSymbolicLink()) {
    walk.skipped.push(rel);
    return;
  }
  if (entry.name.startsWith('.')) {
    return;
  }
  if (entry.isDirectory()) {
    walk.pending.push(rel);
    return;
  }
  if (isSupportingFile(prefix, entry)) {
    walk.candidates.push({ rel, abs: join(dir, rel) });
  }
}

function isSupportingFile(prefix: string, entry: Dirent): boolean {
  if (!entry.isFile()) {
    return false;
  }
  return !(prefix === '' && entry.name === ADDON_SKILL_MD);
}

/** Loads one addon skill from an already-resolved location. */
export function loadAddonSkill(input: {
  addonId: string;
  skillId: string;
  title: string;
  location: AddonSkillLocation;
  logger?: Logger;
}): AddonSkillLoad {
  let raw: string;
  try {
    raw = readFileSync(input.location.skillFile, 'utf8');
  } catch {
    return { ok: false, reason: `cannot read skill file: ${input.location.skillFile}` };
  }
  const doc = parseAddonSkillDocument(raw);
  if (doc.body.length === 0) {
    return { ok: false, reason: `skill body is empty: ${input.location.skillFile}` };
  }
  let files: Record<string, string> = {};
  if (input.location.mode === 'dir') {
    const collected = collectAddonSkillFiles(input.location.dir);
    if (!collected.ok) {
      return { ok: false, reason: collected.reason };
    }
    if (collected.skipped.length > 0) {
      input.logger?.warn(
        { addonId: input.addonId, skillId: input.skillId, files: collected.skipped },
        'addon skill symlinks skipped',
      );
    }
    files = collected.files;
  }
  return {
    ok: true,
    skill: {
      name: addonSkillName(input.addonId, input.skillId),
      description: doc.description ?? input.title.trim(),
      ...(doc.whenToUse !== undefined ? { whenToUse: doc.whenToUse } : {}),
      body: doc.body,
      files,
    },
  };
}

/** Writes SKILL.md plus supporting files into a temporary sibling and swaps it in. */
export function writeAddonSkillDir(dest: string, skill: AddonSkillSource): void {
  const tmp = join(dirname(dest), `.${basename(dest)}.tmp-${process.pid}-${Date.now()}`);
  rmSync(tmp, { recursive: true, force: true });
  try {
    mkdirSync(join(tmp, 'references'), { recursive: true, mode: SKILL_DIR_MODE });
    writeFileSync(join(tmp, ADDON_SKILL_MD), formatAddonSkillMarkdown(skill), 'utf8');
    for (const [rel, content] of Object.entries(skill.files)) {
      const abs = resolveWithin(tmp, rel);
      if (abs === null) {
        continue;
      }
      mkdirSync(dirname(abs), { recursive: true, mode: SKILL_DIR_MODE });
      writeFileSync(abs, content, 'utf8');
    }
    rmSync(dest, { recursive: true, force: true });
    renameSync(tmp, dest);
  } catch (error) {
    rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
}

export function formatAddonSkillMarkdown(skill: AddonSkillSource): string {
  const lines = [
    '---',
    `name: ${JSON.stringify(skill.name)}`,
    `description: ${JSON.stringify(skill.description.trim())}`,
  ];
  if (skill.whenToUse !== undefined && skill.whenToUse.length > 0) {
    lines.push(`when_to_use: ${JSON.stringify(skill.whenToUse)}`);
  }
  lines.push('---', '', skill.body.trim(), '');
  return lines.join('\n');
}

function resolveWithin(root: string, relativePath: string): string | null {
  if (relativePath.length === 0 || isAbsolute(relativePath)) {
    return null;
  }
  const abs = resolve(root, relativePath);
  if (abs !== root && !abs.startsWith(root + sep)) {
    return null;
  }
  return abs;
}

function relPathOf(prefix: string, name: string): string {
  return prefix === '' ? name : `${prefix}/${name}`;
}

function readDirEntries(dir: string): Dirent[] {
  try {
    return [...readdirSync(dir, { withFileTypes: true })].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  } catch {
    return [];
  }
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) {
    return raw;
  }
  const end = raw.indexOf('\n---', 3);
  return end === -1 ? raw : raw.slice(raw.indexOf('\n', end + 1) + 1);
}
