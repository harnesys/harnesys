import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseSkillFile, type SkillDocument } from 'harnesys';
import {
  entrySkipReason,
  type GitIgnoreLayer,
  loadIgnoreFile,
} from '../knowledge/knowledge-walk-ignore.ts';

export interface WalkCandidate {
  name: string;
  description: string;
  whenToUse?: string;
  dir: string;
  relativePath: string;
  outsideContainer: boolean;
  invalidReason?: string;
}

export interface WalkResult {
  candidates: WalkCandidate[];
  agentMarkdownPaths: string[];
}

export const CONTAINER_DIRS: readonly string[] = [
  '',
  'skills',
  'skills/.curated',
  'skills/.experimental',
  'skills/.system',
  '.agents/skills',
  '.claude/skills',
];

const MAX_DEPTH = 12;
const MAX_SKILL_DIRS = 500;
const MAX_TREE_ENTRIES = 20_000;
const CONTAINER_DEPTH = 3;
const SKILL_MD = 'SKILL.md';
const AGENTS_MD = 'AGENTS.md';
const HARNESYS_IGNORE = '.harnesysignore';

interface RawHit {
  rel: string;
  depth: number;
  dir: string;
  doc?: SkillDocument;
  error?: string;
}

interface WalkState {
  root: string;
  rootIg: Awaited<ReturnType<typeof loadIgnoreFile>>;
  layers: GitIgnoreLayer[];
  entries: number;
  hits: RawHit[];
  agentMd: string[];
}

export async function walkSkills(root: string): Promise<WalkResult> {
  const state: WalkState = {
    root,
    rootIg: await loadIgnoreFile(join(root, HARNESYS_IGNORE)),
    layers: [],
    entries: 0,
    hits: [],
    agentMd: [],
  };
  await walkDir(state, root, '', 0);
  return finish(state);
}

async function walkDir(
  state: WalkState,
  absDir: string,
  rel: string,
  depth: number,
): Promise<void> {
  if (state.entries >= MAX_TREE_ENTRIES) {
    return;
  }
  const hit = await skillHitAt(absDir, rel, depth);
  if (hit !== undefined && state.hits.length < MAX_SKILL_DIRS) {
    state.hits.push(hit);
  }
  if (depth >= MAX_DEPTH) {
    return;
  }
  let dirents: Dirent<string>[];
  try {
    dirents = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  const nestedIg = await loadIgnoreFile(join(absDir, HARNESYS_IGNORE));
  if (nestedIg !== undefined && rel !== '') {
    state.layers.push({ relDir: rel, ig: nestedIg });
  }
  for (const entry of dirents) {
    state.entries++;
    if (state.entries >= MAX_TREE_ENTRIES) {
      return;
    }
    await visitEntry(state, absDir, rel, depth, entry);
  }
  if (nestedIg !== undefined && rel !== '') {
    state.layers.pop();
  }
}

async function visitEntry(
  state: WalkState,
  absDir: string,
  rel: string,
  depth: number,
  entry: Dirent<string>,
): Promise<void> {
  if (entry.isSymbolicLink()) {
    return;
  }
  const relEntry = rel === '' ? entry.name : `${rel}/${entry.name}`;
  const skip = entrySkipReason({
    name: entry.name,
    uri: relEntry,
    isDir: entry.isDirectory(),
    gitLayers: state.layers,
    harnesysIg: state.rootIg,
  });
  if (skip !== undefined) {
    return;
  }
  if (entry.name === AGENTS_MD && entry.isFile()) {
    state.agentMd.push(join(state.root, relEntry));
    return;
  }
  if (entry.isDirectory()) {
    await walkDir(state, join(absDir, entry.name), relEntry, depth + 1);
  }
}

async function skillHitAt(absDir: string, rel: string, depth: number): Promise<RawHit | undefined> {
  let content: string;
  try {
    content = await readFile(join(absDir, SKILL_MD), 'utf8');
  } catch {
    return undefined;
  }
  const dir = absDir;
  try {
    return { rel, depth, dir, doc: parseSkillFile(content, join(rel, SKILL_MD)) };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { rel, depth, dir, error: message };
  }
}

function finish(state: WalkState): WalkResult {
  const ranked = [...state.hits].sort(rankHits);
  const winners = new Map<string, RawHit>();
  const duplicates: RawHit[] = [];
  for (const hit of ranked) {
    const key = hit.doc?.name ?? `\u0000invalid:${hit.rel}`;
    const existing = winners.get(key);
    if (existing !== undefined) {
      duplicates.push(hit);
      continue;
    }
    winners.set(key, hit);
  }
  const candidates: WalkCandidate[] = [];
  for (const hit of winners.values()) {
    candidates.push(toCandidate(hit));
  }
  for (const hit of duplicates) {
    candidates.push({ ...toCandidate(hit), invalidReason: 'duplicate-name' });
  }
  return { candidates, agentMarkdownPaths: state.agentMd };
}

function rankHits(a: RawHit, b: RawHit): number {
  const ca = inContainer(a.rel) ? 0 : 1;
  const cb = inContainer(b.rel) ? 0 : 1;
  if (ca !== cb) {
    return ca - cb;
  }
  if (a.depth !== b.depth) {
    return a.depth - b.depth;
  }
  return a.rel.localeCompare(b.rel);
}

function inContainer(rel: string): boolean {
  for (const base of CONTAINER_DIRS) {
    if (rel === base) {
      return true;
    }
    if (base !== '' && rel.startsWith(`${base}/`)) {
      return rel.slice(base.length + 1).split('/').length <= CONTAINER_DEPTH;
    }
  }
  return false;
}

function toCandidate(hit: RawHit): WalkCandidate {
  const outside = !inContainer(hit.rel);
  const fallbackName = hit.rel === '' ? basename(hit.dir) : basename(hit.rel);
  if (hit.doc === undefined) {
    return {
      name: fallbackName,
      description: '',
      dir: hit.dir,
      relativePath: hit.rel,
      outsideContainer: outside,
      invalidReason: hit.error ?? 'invalid skill file',
    };
  }
  return {
    name: hit.doc.name,
    description: hit.doc.description,
    ...(hit.doc.whenToUse !== undefined ? { whenToUse: hit.doc.whenToUse } : {}),
    dir: hit.dir,
    relativePath: hit.rel,
    outsideContainer: outside,
  };
}
