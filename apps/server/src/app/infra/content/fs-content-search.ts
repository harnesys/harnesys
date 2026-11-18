import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  type ContentSearchFile,
  type ContentSearchMatch,
  type ContentSearchSourceResult,
  MAX_SEARCH_FILE_BYTES,
  MAX_SEARCH_LINE_CHARS,
} from '@harnesys/contracts';
import { SAFETY_NAMES } from '../../../const.ts';
import {
  ContentNotFoundException,
  ContentPathEscapeException,
  ContentSearchQueryException,
} from '../../domain/content/content.error.ts';
import type { ContentSearchOptions } from '../../domain/content/org-content.port.ts';
import { compileSearchPattern } from '../../domain/content/search-pattern.ts';
import {
  type GitIgnoreLayer,
  ignoredByLayers,
  loadIgnoreFile,
} from '../knowledge/knowledge-walk-ignore.ts';
import { safe } from './fs-content-ops.ts';

const BINARY_SNIFF_BYTES = 8192;
const SEARCH_TIME_BUDGET_MS = 8000;
const MAX_SCANNED_ENTRIES = 50_000;
const MAX_LINE_MATCHES = 50;

interface SearchState {
  sourceId: string;
  mask: Bun.Glob[];
  total: number;
  limit: number;
  scanned: number;
  truncated: boolean;
  deadline: number;
  files: ContentSearchFile[];
}

export async function searchSourceAt(
  sourceId: string,
  root: string,
  relPath: string,
  query: string,
  options: ContentSearchOptions,
): Promise<ContentSearchSourceResult> {
  const abs = safe(root, relPath);
  const info = await stat(abs).catch(() => undefined);
  if (!info) {
    throw new ContentNotFoundException(relPath);
  }
  if (!info.isDirectory()) {
    throw new ContentPathEscapeException('search path is not a directory');
  }
  const state: SearchState = {
    sourceId,
    mask: compileMask(options.mask),
    total: 0,
    limit: options.limit,
    scanned: 0,
    truncated: false,
    deadline: Date.now() + SEARCH_TIME_BUDGET_MS,
    files: [],
  };
  const matcher = compileSearchPattern(query, options);
  const rootLayer = await loadIgnoreFile(join(root, '.gitignore'));
  const layers: GitIgnoreLayer[] = rootLayer ? [{ relDir: '', ig: rootLayer }] : [];
  await walkDirectory(state, matcher, { dir: abs, relDir: relPath, layers });
  return { files: state.files, matchCount: state.total, truncated: state.truncated };
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

interface WalkInput {
  dir: string;
  relDir: string;
  layers: GitIgnoreLayer[];
}

async function walkDirectory(state: SearchState, matcher: RegExp, input: WalkInput): Promise<void> {
  if (isSearchDone(state)) {
    return;
  }
  const entries = await readdir(input.dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (isSearchDone(state)) {
      return;
    }
    if (await walkEntry(state, matcher, input, entry)) {
      return;
    }
  }
}

async function walkEntry(
  state: SearchState,
  matcher: RegExp,
  input: WalkInput,
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
  const relName = input.relDir ? `${input.relDir}/${entry.name}` : entry.name;
  if (SAFETY_NAMES.has(entry.name) || ignoredByLayers(input.layers, relName, entry.isDirectory())) {
    return false;
  }
  const absPath = join(input.dir, entry.name);
  if (entry.isDirectory()) {
    await walkDirectory(state, matcher, {
      dir: absPath,
      relDir: relName,
      layers: await childLayers(input.layers, absPath, relName),
    });
    return false;
  }
  if (entry.isFile() && matchesMask(state.mask, relName)) {
    await searchFile(state, matcher, absPath, relName);
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

function isSearchDone(state: SearchState): boolean {
  if (state.total >= state.limit) {
    state.truncated = true;
    return true;
  }
  if (Date.now() > state.deadline) {
    state.truncated = true;
    return true;
  }
  return false;
}

async function searchFile(
  state: SearchState,
  matcher: RegExp,
  absPath: string,
  relPath: string,
): Promise<void> {
  const info = await stat(absPath).catch(() => undefined);
  if (!info || info.size === 0 || info.size > MAX_SEARCH_FILE_BYTES) {
    return;
  }
  const bytes = await readFile(absPath).catch(() => undefined);
  if (!bytes || isBinary(bytes)) {
    return;
  }
  const matches = collectFileMatches(matcher, new TextDecoder('utf-8').decode(bytes), state);
  if (matches.length === 0) {
    return;
  }
  state.files.push({
    sourceId: state.sourceId,
    path: relPath,
    name: basename(relPath),
    matches,
  });
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

function collectFileMatches(
  matcher: RegExp,
  content: string,
  state: SearchState,
): ContentSearchMatch[] {
  const matches: ContentSearchMatch[] = [];
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const hits = matchLine(matcher, line);
    for (const hit of hits) {
      if (state.total >= state.limit) {
        state.truncated = true;
        return matches;
      }
      const clipped = clipLine(line, hit.start, hit.end);
      if (!clipped) {
        continue;
      }
      matches.push({
        line: index + 1,
        column: hit.start + 1,
        text: clipped.text,
        start: clipped.start,
        end: clipped.end,
      });
      state.total += 1;
    }
  }
  return matches;
}

interface LineHit {
  start: number;
  end: number;
}

function matchLine(matcher: RegExp, line: string): LineHit[] {
  if (line.length === 0) {
    return [];
  }
  matcher.lastIndex = 0;
  const hits: LineHit[] = [];
  let match = matcher.exec(line);
  while (match !== null && hits.length < MAX_LINE_MATCHES) {
    if (match[0].length === 0) {
      matcher.lastIndex = match.index + 1;
    } else {
      hits.push({ start: match.index, end: match.index + match[0].length });
    }
    match = matcher.exec(line);
  }
  return hits;
}

interface ClippedLine {
  text: string;
  start: number;
  end: number;
}

function clipLine(line: string, matchStart: number, matchEnd: number): ClippedLine | null {
  if (line.length <= MAX_SEARCH_LINE_CHARS) {
    return { text: line, start: matchStart, end: matchEnd };
  }
  const half = Math.floor(MAX_SEARCH_LINE_CHARS / 3);
  const from = Math.max(0, Math.min(matchStart - half, line.length - MAX_SEARCH_LINE_CHARS));
  const to = Math.min(line.length, from + MAX_SEARCH_LINE_CHARS);
  if (matchStart < from || matchEnd > to) {
    return null;
  }
  const prefix = from > 0 ? '…' : '';
  const suffix = to < line.length ? '…' : '';
  const offset = prefix.length - from;
  return {
    text: `${prefix}${line.slice(from, to)}${suffix}`,
    start: matchStart + offset,
    end: matchEnd + offset,
  };
}
