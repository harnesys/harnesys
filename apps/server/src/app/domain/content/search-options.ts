import type { ContentReplaceBody, ContentSearchQuery } from '@harnesys/contracts';
import type { ContentReplaceOptions, ContentSearchOptions } from './org-content.port.ts';

export function splitMask(mask: string | undefined): string[] {
  return (mask ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function searchOptionsFromQuery(
  query: ContentSearchQuery,
  limit: number,
): ContentSearchOptions {
  return {
    caseSensitive: query.caseSensitive === 'true',
    wholeWord: query.wholeWord === 'true',
    regex: query.regex === 'true',
    mask: splitMask(query.mask),
    limit,
    dir: query.dir ?? '',
  };
}

export function replaceOptionsFromBody(body: ContentReplaceBody): ContentReplaceOptions {
  return {
    caseSensitive: body.caseSensitive === true,
    wholeWord: body.wholeWord === true,
    regex: body.regex === true,
    mask: splitMask(body.mask),
    dir: body.dir ?? '',
    dryRun: body.dryRun === true,
  };
}
