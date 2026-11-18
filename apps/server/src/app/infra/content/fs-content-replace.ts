import type { ContentReplaceSourceResult } from '@harnesys/contracts';
import type {
  ContentReplaceFileTarget,
  ContentReplaceOptions,
} from '../../domain/content/org-content.port.ts';
import { compileSearchPattern } from '../../domain/content/search-pattern.ts';
import { writeAt } from './fs-content-ops.ts';
import { walkTextFiles } from './fs-search-walk.ts';

const REPLACE_TIME_BUDGET_MS = 20_000;

export async function replaceSourceAt(
  root: string,
  relPath: string,
  query: string,
  replacement: string,
  options: ContentReplaceOptions,
): Promise<ContentReplaceSourceResult> {
  const matcher = compileSearchPattern(query, options);
  const literal = options.regex ? replacement : escapeReplacement(replacement);
  const targets = options.targets ? new Map(options.targets.map((row) => [row.path, row])) : null;
  const files: Array<{ path: string; replaced: number }> = [];
  let total = 0;
  const walk = await walkTextFiles({
    root,
    relPath,
    mask: options.mask,
    deadline: Date.now() + REPLACE_TIME_BUDGET_MS,
    shouldStop: () => false,
    onFile: ({ relPath: filePath, content }) => {
      const target = targets === null ? undefined : targets.get(filePath);
      if (targets !== null && target === undefined) {
        return;
      }
      const replaced = replaceContent(matcher, literal, content, target);
      if (replaced.count === 0) {
        return;
      }
      total += replaced.count;
      files.push({ path: filePath, replaced: replaced.count });
      if (!options.dryRun) {
        writeAt(root, filePath, new TextEncoder().encode(replaced.content));
      }
    },
  });
  return { files, matchCount: total, truncated: walk.truncated };
}

interface ReplacedContent {
  content: string;
  count: number;
}

function replaceContent(
  matcher: RegExp,
  replacement: string,
  content: string,
  target?: ContentReplaceFileTarget,
): ReplacedContent {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  if (target?.line !== undefined) {
    return replaceLine(lines, eol, matcher, replacement, target);
  }
  let count = 0;
  const next = lines.map((line) => {
    matcher.lastIndex = 0;
    const hits = line.match(matcher);
    if (!hits || hits.length === 0) {
      return line;
    }
    count += hits.length;
    return line.replace(matcher, replacement);
  });
  if (count === 0) {
    return { content, count };
  }
  return { content: next.join(eol), count };
}

function replaceLine(
  lines: string[],
  eol: string,
  matcher: RegExp,
  replacement: string,
  target: ContentReplaceFileTarget,
): ReplacedContent {
  const index = (target.line ?? 0) - 1;
  const line = lines[index];
  if (line === undefined) {
    return { content: lines.join(eol), count: 0 };
  }
  const replaced = replaceOccurrence(matcher, line, replacement, target);
  if (replaced === null) {
    return { content: lines.join(eol), count: 0 };
  }
  lines[index] = replaced;
  return { content: lines.join(eol), count: 1 };
}

function replaceOccurrence(
  matcher: RegExp,
  line: string,
  replacement: string,
  target: ContentReplaceFileTarget,
): string | null {
  const hits = findHits(matcher, line);
  if (hits.length === 0) {
    return null;
  }
  const hit = pickHit(hits, target);
  if (hit === undefined) {
    return null;
  }
  const sticky = new RegExp(matcher.source, `${matcher.flags.replace('g', '')}y`);
  const head = line.slice(0, hit.start);
  const tail = line.slice(hit.start);
  return head + tail.replace(sticky, replacement);
}

interface LineHit {
  start: number;
  text: string;
}

function pickHit(hits: LineHit[], target: ContentReplaceFileTarget): LineHit | undefined {
  const candidates =
    target.matchText === undefined ? hits : hits.filter((item) => item.text === target.matchText);
  if (candidates.length === 0) {
    return undefined;
  }
  const column = target.column;
  if (column === undefined) {
    return candidates[0];
  }
  const exact = candidates.find((item) => item.start + 1 === column);
  return exact ?? nearest(candidates, column - 1);
}

function nearest(hits: LineHit[], index: number): LineHit | undefined {
  let best: LineHit | undefined;
  for (const hit of hits) {
    if (best === undefined || Math.abs(hit.start - index) < Math.abs(best.start - index)) {
      best = hit;
    }
  }
  return best;
}

function findHits(matcher: RegExp, line: string): LineHit[] {
  matcher.lastIndex = 0;
  const hits: LineHit[] = [];
  let match = matcher.exec(line);
  while (match !== null) {
    if (match[0].length === 0) {
      matcher.lastIndex = match.index + 1;
    } else {
      hits.push({ start: match.index, text: match[0] });
    }
    match = matcher.exec(line);
  }
  return hits;
}

function escapeReplacement(replacement: string): string {
  return replacement.replace(/\$/g, '$$$$');
}
