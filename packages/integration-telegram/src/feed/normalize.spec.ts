import { describe, expect, test } from 'bun:test';
import { normalizePost } from './normalize.ts';

describe('normalizePost', () => {
  test('maps text, date, and media kind', () => {
    const post = normalizePost({
      id: 552,
      date: 1762400000,
      text: 'Hello',
      topicId: null,
      mediaName: 'MessageMediaPhoto',
      senderName: 'Durov',
    });
    expect(post.postId).toBe(552);
    expect(post.text).toBe('Hello');
    expect(post.authorTitle).toBe('Durov');
    expect(post.mediaKinds).toEqual(['photo']);
    expect(post.publishedAt).toBe(new Date(1762400000 * 1000).toISOString());
  });

  test('keeps unknown media class names', () => {
    const post = normalizePost({
      id: 1,
      date: 0,
      text: '',
      topicId: 42,
      mediaName: 'MessageMediaStory',
      senderName: null,
    });
    expect(post.mediaKinds).toEqual(['MessageMediaStory']);
    expect(post.topicId).toBe(42);
    expect(post.authorTitle).toBeNull();
  });
});
