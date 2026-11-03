export const MENTION_HREF_PREFIX = 'mention:';

const MENTION_PATTERN = /(^|[\s([{>])@([\p{L}\p{N}._-]+)/gu;
const FENCE_PATTERN = /^\s*(```|~~~)/;
const CODE_SPAN_PATTERN = /(`+[^`]*`+)/;

export function mentionHandle(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}._-]/gu, '');
  return slug || 'member';
}

export function markMentions(text: string): string {
  let fenced = false;
  return text
    .split('\n')
    .map((line) => {
      if (FENCE_PATTERN.test(line)) {
        fenced = !fenced;
        return line;
      }
      return fenced ? line : markLine(line);
    })
    .join('\n');
}

export function mentionSlugOf(href: string | undefined): string | null {
  if (!href?.startsWith(MENTION_HREF_PREFIX)) {
    return null;
  }
  const slug = href.slice(MENTION_HREF_PREFIX.length);
  return slug.length > 0 ? slug : null;
}

function markLine(line: string): string {
  return line
    .split(CODE_SPAN_PATTERN)
    .map((part, index) => (index % 2 === 1 ? part : markSegment(part)))
    .join('');
}

function markSegment(segment: string): string {
  return segment.replace(
    MENTION_PATTERN,
    (match, prefix: string, slug: string, offset: number, whole: string) => {
      const suffix = whole.slice(offset + match.length);
      if (suffix.startsWith('](mention:')) {
        return match;
      }
      return `${prefix}[@${slug}](${MENTION_HREF_PREFIX}${slug})`;
    },
  );
}
