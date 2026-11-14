import { chatRefOf, resolveArgOf } from './chat-target.ts';

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

function channelOf(entry: string): string | null {
  try {
    return resolveArgOf(chatRefOf(entry));
  } catch {
    return null;
  }
}

export function channelsOf(config: Record<string, unknown>): string[] {
  const value = config.channels;
  if (typeof value !== 'string') {
    return [];
  }
  const channels: string[] = [];
  for (const entry of value.split(/[\n,]/)) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const channel = channelOf(trimmed);
    if (channel !== null) {
      channels.push(channel);
    }
  }
  return [...new Set(channels)];
}
