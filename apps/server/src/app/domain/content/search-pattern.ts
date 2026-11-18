import { ContentSearchQueryException } from './content.error.ts';
import type { PatternOptions } from './org-content.port.ts';

export function compileSearchPattern(query: string, options: PatternOptions): RegExp {
  const source = options.regex ? query : escapeRegExp(query);
  const body = options.wholeWord ? `\\b(?:${source})\\b` : `(?:${source})`;
  const flags = options.caseSensitive ? 'gu' : 'giu';
  try {
    return new RegExp(body, flags);
  } catch (err) {
    throw new ContentSearchQueryException(
      err instanceof Error ? err.message : 'invalid regular expression',
    );
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
