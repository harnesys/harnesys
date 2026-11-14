export interface FeedFilter {
  keywords: string[];
  exclude: string[];
  match: 'any' | 'all';
}

export function parseList(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(/[,\n]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function filterOf(config: Record<string, unknown>): FeedFilter {
  return {
    keywords: parseList(config.keywords),
    exclude: parseList(config.exclude),
    match: config.match === 'all' ? 'all' : 'any',
  };
}

export function matchesFilter(filter: FeedFilter, text: string): boolean {
  const haystack = text.toLowerCase();
  if (filter.exclude.some((term) => haystack.includes(term))) {
    return false;
  }
  if (filter.keywords.length === 0) {
    return true;
  }
  return filter.match === 'all'
    ? filter.keywords.every((term) => haystack.includes(term))
    : filter.keywords.some((term) => haystack.includes(term));
}

export function normalizePeer(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('https://t.me/') || value.startsWith('http://t.me/')) {
    return `@${value.replace(/^https?:\/\/t\.me\//, '').replace(/^s\//, '')}`;
  }
  if (value.startsWith('t.me/')) {
    return `@${value.slice('t.me/'.length)}`;
  }
  return value;
}

export function channelsOf(config: Record<string, unknown>): string[] {
  const value = config.channels;
  if (typeof value !== 'string') {
    return [];
  }
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map(normalizePeer)
        .filter((peer) => peer.length > 0),
    ),
  ];
}
