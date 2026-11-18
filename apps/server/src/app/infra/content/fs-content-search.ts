import { basename } from 'node:path';
import {
  type ContentSearchFile,
  type ContentSearchMatch,
  type ContentSearchSourceResult,
  MAX_SEARCH_LINE_CHARS,
} from '@harnesys/contracts';
import type { ContentSearchOptions } from '../../domain/content/org-content.port.ts';
import { compileSearchPattern } from '../../domain/content/search-pattern.ts';
import { walkTextFiles } from './fs-search-walk.ts';

const SEARCH_TIME_BUDGET_MS = 8000;
const MAX_LINE_MATCHES = 50;

interface SearchState {
  total: number;
  limit: number;
  truncated: boolean;
}

export async function searchSourceAt(
  sourceId: string,
  root: string,
  relPath: string,
  query: string,
  options: ContentSearchOptions,
): Promise<ContentSearchSourceResult> {
  const matcher = compileSearchPattern(query, options);
  const state: SearchState = { total: 0, limit: options.limit, truncated: false };
  const files: ContentSearchFile[] = [];
  const walk = await walkTextFiles({
    root,
    relPath,
    mask: options.mask,
    deadline: Date.now() + SEARCH_TIME_BUDGET_MS,
    shouldStop: () => state.total >= state.limit,
    onFile: ({ relPath: filePath, content }) => {
      const matches = collectFileMatches(matcher, content, state);
      if (matches.length > 0) {
        files.push({ sourceId, path: filePath, name: basename(filePath), matches });
      }
    },
  });
  return {
    files,
    matchCount: state.total,
    truncated: state.truncated || walk.truncated,
  };
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
