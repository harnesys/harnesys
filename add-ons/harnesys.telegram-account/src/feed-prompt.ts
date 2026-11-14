import type { RawPost, ResolvedPeer } from './telegram-types.ts';

export function postLinkOf(resolved: ResolvedPeer, post: RawPost): string {
  if (resolved.username === null) {
    return '';
  }
  const topic = post.topicId === null ? '' : `?thread=${post.topicId}`;
  return `https://t.me/${resolved.username}/${post.postId}${topic}`;
}

export function postFieldsOf(
  resolved: ResolvedPeer,
  post: RawPost,
): Array<{ label: string; value: string; href?: string }> {
  const link = postLinkOf(resolved, post);
  return [
    { label: 'Channel', value: resolved.title },
    { label: 'Post', value: `#${post.postId}` },
    { label: 'Published', value: post.publishedAt },
    ...(post.mediaKind === null ? [] : [{ label: 'Media', value: post.mediaKind }]),
    ...(link === '' ? [] : [{ label: 'Link', value: 'Open post', href: link }]),
  ];
}
