export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}
export type SearchTimeRange = 'day' | 'week' | 'month' | 'year';
export interface SearchOptions {
  language?: string;
  timeRange?: SearchTimeRange;
  categories?: string;
  pageno?: number;
  engines?: readonly string[];
}
export interface SearchInfobox {
  title: string;
  url?: string;
  content?: string;
}
export interface SearchMeta {
  numberOfResults?: number;
  enginesUsed?: string[];
  unresponsiveEngines?: string[];
  droppedUnusableLinks?: number;
  answers?: string[];
  infoboxes?: SearchInfobox[];
}
export interface SearchResponse {
  results: SearchResult[];
  meta?: SearchMeta;
}
export interface SearchProvider {
  search: (query: string, options: SearchOptions) => Promise<SearchResponse>;
}
const DUCKDUCKGO_MIN_DELAY_MS = 2000;
const SEARXNG_MIN_DELAY_MS = 1000;
const SEARXNG_TIMEOUT_MS = 10000;
const FAILURE_HINT = 'Stop retrying and tell the user that web search is temporarily unavailable.';
const UNREACHABLE_FALLBACK_HINT =
  'In-pack fallbacks: fetch for a known URL, browser_fetch/browser when the web pack grants them.';

export interface FailureGuidance {
  url: string;
  providers: readonly string[];
}

export function isConnectivityFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const failure = error as { name?: unknown; message?: unknown };
  const label = `${String(failure.name ?? '')} ${String(failure.message ?? '')}`.toLowerCase();
  return (
    label.includes('timeouterror') ||
    label.includes('timed out') ||
    label.includes('etimedout') ||
    label.includes('unable to connect') ||
    label.includes('connection refused') ||
    label.includes('econnrefused') ||
    label.includes('enotfound')
  );
}

export function describeFailure(
  provider: string,
  error: unknown,
  guidance?: FailureGuidance,
): Error {
  const detail = error instanceof Error ? error.message : String(error);
  if (guidance !== undefined && isConnectivityFailure(error)) {
    return new Error(
      `${provider} at ${guidance.url} is unreachable (${detail}): check that the instance is deployed and reachable, set a different searxngUrl in the web pack settings, or switch provider (supported: ${guidance.providers.join(', ')}). ${UNREACHABLE_FALLBACK_HINT} ${FAILURE_HINT}`,
    );
  }
  return new Error(`${provider}: ${detail}. ${FAILURE_HINT}`);
}
function createLimiter(minDelayMs: number): <T>(task: () => Promise<T>) => Promise<T> {
  let lastRequestAt = 0;
  let tail: Promise<unknown> = Promise.resolve();
  return (task) => {
    const next = tail.then(async () => {
      const elapsed = Date.now() - lastRequestAt;
      if (elapsed < minDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, minDelayMs - elapsed));
      }
      lastRequestAt = Date.now();
      return task();
    });
    tail = next.catch(() => undefined);
    return next;
  };
}
const duckduckgoLimiter = createLimiter(DUCKDUCKGO_MIN_DELAY_MS);
const DUCKDUCKGO_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
};
export function duckduckgoSearch(): SearchProvider {
  return {
    search: (query) =>
      duckduckgoLimiter(async () => {
        try {
          const response = await fetch('https://html.duckduckgo.com/html/', {
            method: 'POST',
            headers: {
              ...DUCKDUCKGO_HEADERS,
              'content-type': 'application/x-www-form-urlencoded',
              origin: 'https://html.duckduckgo.com',
              referer: 'https://html.duckduckgo.com/',
            },
            body: new URLSearchParams({ q: query, kl: 'wt-wt' }).toString(),
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return { results: parseDuckduckgoHtml(await response.text()) };
        } catch (error) {
          throw describeFailure('duckduckgo', error);
        }
      }),
  };
}
const RESULT_LINK_REGEX = /<a[^>]+class="result__a"[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const RESULT_SNIPPET_REGEX = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
function parseDuckduckgoHtml(body: string): SearchResult[] {
  if (body.includes('no-results') || body.includes('try to focus')) {
    return [];
  }
  const links: Array<{
    url: string;
    title: string;
  }> = [];
  for (const match of body.matchAll(RESULT_LINK_REGEX)) {
    if (match[1] === undefined) {
      continue;
    }
    links.push({ url: match[1], title: stripTags(match[2] ?? '') });
  }
  const snippets: string[] = [];
  for (const match of body.matchAll(RESULT_SNIPPET_REGEX)) {
    if (match[1] !== undefined) {
      snippets.push(stripTags(match[1]));
    }
  }
  const results: SearchResult[] = [];
  for (let i = 0; i < links.length; i += 1) {
    const link = links[i];
    if (link === undefined) {
      continue;
    }
    results.push({
      title: link.title,
      url: unwrapDuckduckgoRedirect(link.url),
      snippet: snippets[i] ?? '',
    });
  }
  return results;
}
function unwrapDuckduckgoRedirect(url: string): string {
  if (!url.startsWith('//duckduckgo.com/l/')) {
    return url;
  }
  const resolved = new URL(url, 'https://duckduckgo.com');
  return resolved.searchParams.get('uddg') ?? url;
}
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}
export interface SearxngOptions {
  url: string;
  providers: readonly string[];
}
export function searxngSearch(options: SearxngOptions): SearchProvider {
  const limiter = createLimiter(SEARXNG_MIN_DELAY_MS);
  const base = options.url.replace(/\/+$/, '');
  return {
    search: (query, searchOptions) =>
      limiter(async () => {
        try {
          const params = buildSearxngParams(query, searchOptions);
          const response = await fetch(`${base}/search?${params.toString()}`, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(SEARXNG_TIMEOUT_MS),
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return parseSearxngResponse((await response.json()) as SearxngResponse, base);
        } catch (error) {
          throw describeFailure('searxng', error, {
            url: options.url,
            providers: options.providers,
          });
        }
      }),
  };
}
export function buildSearxngParams(query: string, options: SearchOptions): URLSearchParams {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    categories: options.categories ?? 'general',
    language: options.language ?? 'all',
  });
  if (options.timeRange !== undefined) {
    params.set('time_range', options.timeRange);
  }
  if (options.pageno !== undefined) {
    params.set('pageno', String(options.pageno));
  }
  if (options.engines !== undefined && options.engines.length > 0) {
    params.set('engines', options.engines.join(','));
  }
  return params;
}
export function parseSearxngResponse(data: SearxngResponse, baseUrl?: string): SearchResponse {
  const { results, dropped } = searxngResults(data, baseUrl);
  const meta: SearchMeta = {};
  if (dropped > 0) {
    meta.droppedUnusableLinks = dropped;
  }
  if (typeof data.number_of_results === 'number') {
    meta.numberOfResults = data.number_of_results;
  }
  const enginesUsed = distinctStrings((data.results ?? []).map((item) => item.engine));
  if (enginesUsed.length > 0) {
    meta.enginesUsed = enginesUsed;
  }
  const unresponsive = describeUnresponsiveEngines(data.unresponsive_engines);
  if (unresponsive.length > 0) {
    meta.unresponsiveEngines = unresponsive;
  }
  if (Array.isArray(data.answers) && data.answers.length > 0) {
    meta.answers = data.answers.map((answer) => String(answer));
  }
  const infoboxes = parseSearxngInfoboxes(data.infoboxes);
  if (infoboxes.length > 0) {
    meta.infoboxes = infoboxes;
  }
  return { results, ...(Object.keys(meta).length > 0 ? { meta } : {}) };
}

const EMPTY_AUTHORITY_RE = /^https?:\/\/(?=[/?#]|$)/i;

function searxngResults(
  data: SearxngResponse,
  baseUrl: string | undefined,
): { results: SearchResult[]; dropped: number } {
  const results: SearchResult[] = [];
  let dropped = 0;
  for (const item of data.results ?? []) {
    const usable = usableResultUrl(item.url ?? '', baseUrl);
    if (usable === null) {
      dropped += 1;
      continue;
    }
    results.push({ title: item.title ?? '', url: usable, snippet: item.content ?? '' });
  }
  return { results, dropped };
}

function usableResultUrl(raw: string, baseUrl?: string): string | null {
  if (raw === '') {
    return null;
  }
  if (EMPTY_AUTHORITY_RE.test(raw)) {
    return resolveRelativeResult(raw.slice(raw.indexOf('//') + 2), baseUrl);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return resolveRelativeResult(raw, baseUrl);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  return url.host === '' ? null : raw;
}

function resolveRelativeResult(path: string, baseUrl?: string): string | null {
  if (baseUrl === undefined || !path.startsWith('/') || path.startsWith('//')) {
    return null;
  }
  try {
    return new URL(path, baseUrl).href;
  } catch {
    return null;
  }
}
function describeUnresponsiveEngines(raw: SearxngUnresponsiveEngines | undefined): string[] {
  if (Array.isArray(raw)) {
    return raw.map((entry) =>
      Array.isArray(entry) ? `${String(entry[0])}: ${String(entry[1])}` : String(entry),
    );
  }
  if (raw !== undefined && typeof raw === 'object') {
    return Object.entries(raw).map(([name, reason]) => `${name}: ${reason}`);
  }
  return [];
}
type SearxngUnresponsiveEngines = Array<readonly [string, string]> | Record<string, string>;
interface SearxngInfobox {
  infobox?: string;
  title?: string;
  url?: string;
  content?: string;
}
function parseSearxngInfoboxes(raw: SearxngInfobox[] | undefined): SearchInfobox[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((box) => typeof box === 'object' && box !== null)
    .map((box) => ({
      title: String(box.infobox ?? box.title ?? ''),
      ...(typeof box.url === 'string' && box.url !== '' ? { url: box.url } : {}),
      ...(typeof box.content === 'string' && box.content !== '' ? { content: box.content } : {}),
    }))
    .filter((box) => box.title !== '' || box.content !== undefined);
}
function distinctStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value === 'string' && value !== '') {
      seen.add(value);
    }
  }
  return [...seen];
}
export interface SearxngResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    engine?: string;
  }>;
  number_of_results?: number;
  unresponsive_engines?: SearxngUnresponsiveEngines;
  answers?: unknown[];
  infoboxes?: SearxngInfobox[];
}
