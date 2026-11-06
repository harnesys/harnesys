import type { FilterStage, KeywordsStage, PostRecord } from '../model/records.ts';

export function haystackOf(post: Pick<PostRecord, 'text' | 'authorTitle'>): string {
  return `${post.text}\n${post.authorTitle ?? ''}`.toLowerCase();
}

function matchesKeywords(stage: KeywordsStage, haystack: string): boolean {
  const { terms, match, exclude } = stage.config;
  if (exclude.some((term) => haystack.includes(term.toLowerCase()))) {
    return false;
  }
  if (terms.length === 0) {
    return true;
  }
  const lowered = terms.map((term) => term.toLowerCase());
  return match === 'all'
    ? lowered.every((term) => haystack.includes(term))
    : lowered.some((term) => haystack.includes(term));
}

export function matchesFilter(stages: FilterStage[], post: PostRecord): boolean {
  const haystack = haystackOf(post);
  return stages.every((stage) =>
    stage.type === 'keywords' ? matchesKeywords(stage, haystack) : true,
  );
}
