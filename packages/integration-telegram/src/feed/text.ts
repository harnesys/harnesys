import { TEXT_LIMIT } from '../db/schema.ts';
import type { PostRecord, RuleRecord, SourceRecord } from '../model/records.ts';

export function fireId(postId: string, ruleId: string): string {
  return `feed:${postId}:${ruleId}`;
}

export function postUrl(source: SourceRecord, post: PostRecord): string | null {
  if (!source.username) {
    return null;
  }
  const base = `https://t.me/${source.username}/${post.postId}`;
  return post.topicId === null ? base : `${base}?thread=${post.topicId}`;
}

export function taskText(rule: RuleRecord, source: SourceRecord, post: PostRecord): string {
  const url = postUrl(source, post);
  const topic = post.topicId === null ? '' : ` · topic ${post.topicId}`;
  const header = [
    `Telegram post from ${source.title} (#${post.postId}${topic})`,
    `Published ${post.publishedAt}`,
    post.authorTitle ? `Author: ${post.authorTitle}` : '',
    post.mediaKinds.length > 0 ? `Media: ${post.mediaKinds.join(', ')}` : '',
    url ? `Link: ${url}` : '',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
  const body = post.text.length > TEXT_LIMIT ? `${post.text.slice(0, TEXT_LIMIT)}…` : post.text;
  const instruction = rule.detail.length > 0 ? `\n\nInstruction: ${rule.detail}` : '';
  return `${header}\n\n${body}${instruction}`;
}
