import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { MAX_SEARCH_FILE_BYTES } from '@harnesys/contracts';
import { SAFETY_NAMES } from '../../../const.ts';
import {
  ContentNotFoundException,
  ContentPathEscapeException,
  ContentSearchQueryException,
} from '../../domain/content/content.error.ts';
import {
  type GitIgnoreLayer,
  ignoredByLayers,
  loadIgnoreFile,
} from '../knowledge/knowledge-walk-ignore.ts';
import { safe } from './fs-content-ops.ts';

const BINARY_SNIFF_BYTES = 8192;
const MAX_SCANNED_ENTRIES = 50_000;

export interface SearchWalkFile {
  relPath: string;
  content: string;
}

export interface SearchWalkInput {
  root: string;
  relPath: string;
  mask: string[];
  deadline: number;
  shouldStop: () => boolean;
  onFile: (file: SearchWalkFile) => Promise<void> | void;
}

interface WalkState {
  mask: Bun.Glob[];
  scanned: number;
  truncated: boolean;
}

interface WalkDirInput {
  dir: string;
  relDir: string;
  layers: GitIgnoreLayer[];
}

export async function walkTextFiles(input: SearchWalkInput): Promise<{ truncated: boolean }> {
  const abs = await resolveSearchRoot(input.root, input.relPath);
  const state: WalkState = {
    mask: compileMask(input.mask),
    scanned: 0,
    truncated: false,
  };
  const rootLayer = await loadIgnoreFile(join(input.root, '.gitignore'));
  const layers: GitIgnoreLayer[] = rootLayer ? [{ relDir: '', ig: rootLayer }] : [];
  await walkDirectory(state, input, { dir: abs, relDir: input.relPath, layers });
  return { truncated: state.truncated };
}

export async function resolveSearchRoot(root: string, relPath: string): Promise<string> {
  const abs = safe(root, relPath);
  const info = await stat(abs).catch(() => undefined);
  if (!info) {
    throw new ContentNotFoundException(relPath);
  }
  if (!info.isDirectory()) {
    throw new ContentPathEscapeException('search path is not a directory');
  }
  return abs;
}

function compileMask(mask: string[]): Bun.Glob[] {
  const globs: Bun.Glob[] = [];
  for (const raw of mask) {
    const pattern = raw.trim();
    if (!pattern) {
      continue;
    }
    try {
      globs.push(new Bun.Glob(pattern));
    } catch {
      throw new ContentSearchQueryException(`invalid file mask: ${pattern}`, { mask: pattern });
    }
  }
  return globs;
}

async function walkDirectory(
  state: WalkState,
  input: SearchWalkInput,
  dir: WalkDirInput,
): Promise<void> {
  if (isDone(state, input)) {
    return;
  }
  const entries = await readdir(dir.dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (isDone(state, input)) {
      return;
    }
    if (await walkEntry(state, input, dir, entry)) {
      return;
    }
  }
}

async function walkEntry(
  state: WalkState,
  input: SearchWalkInput,
  dir: WalkDirInput,
  entry: Dirent,
): Promise<boolean> {
  if (entry.isSymbolicLink()) {
    return false;
  }
  state.scanned += 1;
  if (state.scanned > MAX_SCANNED_ENTRIES) {
    state.truncated = true;
    return true;
  }
  const relName = dir.relDir ? `${dir.relDir}/${entry.name}` : entry.name;
  if (SAFETY_NAMES.has(entry.name) || ignoredByLayers(dir.layers, relName, entry.isDirectory())) {
    return false;
  }
  const absPath = join(dir.dir, entry.name);
  if (entry.isDirectory()) {
    await walkDirectory(state, input, {
      dir: absPath,
      relDir: relName,
      layers: await childLayers(dir.layers, absPath, relName),
    });
    return false;
  }
  if (entry.isFile() && matchesMask(state.mask, relName)) {
    await visitFile(input, absPath, relName);
  }
  return false;
}

async function childLayers(
  layers: GitIgnoreLayer[],
  absDir: string,
  relDir: string,
): Promise<GitIgnoreLayer[]> {
  const nested = await loadIgnoreFile(join(absDir, '.gitignore'));
  return nested ? [...layers, { relDir, ig: nested }] : layers;
}

function matchesMask(mask: Bun.Glob[], relPath: string): boolean {
  if (mask.length === 0) {
    return true;
  }
  const name = basename(relPath);
  return mask.some((glob) => glob.match(relPath) || glob.match(name));
}

function isDone(state: WalkState, input: SearchWalkInput): boolean {
  if (input.shouldStop() || Date.now() > input.deadline) {
    state.truncated = true;
    return true;
  }
  return false;
}

async function visitFile(input: SearchWalkInput, absPath: string, relPath: string): Promise<void> {
  const info = await stat(absPath).catch(() => undefined);
  if (!info || info.size === 0 || info.size > MAX_SEARCH_FILE_BYTES) {
    return;
  }
  const bytes = await readFile(absPath).catch(() => undefined);
  if (!bytes || isBinary(bytes)) {
    return;
  }
  await input.onFile({ relPath, content: new TextDecoder('utf-8').decode(bytes) });
}

function isBinary(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, BINARY_SNIFF_BYTES);
  for (let index = 0; index < limit; index += 1) {
    if (bytes[index] === 0) {
      return true;
    }
  }
  return false;
}
