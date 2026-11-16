import { listSourceFiles } from '@/shared/api/files';
import { basenamePath, dirnamePath, resolveRelativePath } from './resolve-import-path';

export interface HtmlPathMatch {
  raw: string;
  startColumn: number;
  endColumn: number;
}
const ATTRIBUTE_RE = /(?:^|\s)(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const EXTERNAL_RE = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)/;
const resolveCache = new Map<string, string>();

export function findHtmlPathMatches(line: string): HtmlPathMatch[] {
  const matches: HtmlPathMatch[] = [];
  for (const match of line.matchAll(ATTRIBUTE_RE)) {
    const raw = match[1] ?? match[2] ?? '';
    if (raw === '' || match.index === undefined) {
      continue;
    }
    const start = match.index + match[0].length - 1 - raw.length;
    matches.push({ raw, startColumn: start + 1, endColumn: start + raw.length + 1 });
  }
  return matches;
}

function withoutSuffix(raw: string): string {
  const hash = raw.indexOf('#');
  const head = hash === -1 ? raw : raw.slice(0, hash);
  const query = head.indexOf('?');
  return (query === -1 ? head : head.slice(0, query)).trim();
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function htmlPathCandidates(fromFile: string, raw: string): string[] {
  const clean = withoutSuffix(raw);
  if (clean === '' || EXTERNAL_RE.test(clean)) {
    return [];
  }
  const decoded = decodePath(clean);
  const resolved = decoded.startsWith('/')
    ? decoded.replace(/^\/+/, '')
    : resolveRelativePath(fromFile, decoded);
  return resolved === '' ? [] : [resolved];
}

async function isProjectFile(projectId: string, path: string): Promise<boolean> {
  try {
    const entries = await listSourceFiles(projectId, dirnamePath(path));
    return entries.some((entry) => entry.kind === 'file' && entry.name === basenamePath(path));
  } catch {
    return false;
  }
}

export async function resolveHtmlPathToProjectPath(
  projectId: string,
  fromFile: string,
  raw: string,
): Promise<string | null> {
  const cacheKey = `${projectId}\0${fromFile}\0${raw}`;
  const cached = resolveCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  for (const candidate of htmlPathCandidates(fromFile, raw)) {
    if (await isProjectFile(projectId, candidate)) {
      resolveCache.set(cacheKey, candidate);
      return candidate;
    }
  }
  return null;
}
