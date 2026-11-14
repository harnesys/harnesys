import { describe, expect, test } from 'bun:test';
import { parseHookConfig } from './config.ts';
import { canonicalQuery, extractText, pathText } from './text.ts';

const base = parseHookConfig({});

function config(overrides: Record<string, unknown>) {
  return parseHookConfig(overrides);
}

describe('text extraction', () => {
  test('dot path resolves values, numbers and missing paths', () => {
    const body = { issue: { title: 'Bug', stars: 42 } };
    expect(pathText(body, 'issue.title')).toBe('Bug');
    expect(pathText(body, 'issue.stars')).toBe('42');
    expect(pathText(body, 'issue.missing.deep')).toBe('');
    const extracted = extractText(config({ textPath: 'issue.title' }), {
      rawBody: JSON.stringify(body),
      body,
      query: {},
    });
    expect(extracted).toBe('Bug');
  });

  test('template renders text and payload placeholders', () => {
    const body = { text: 'hello', who: 'ops' };
    const extracted = extractText(config({ textTemplate: 'note: {{text}} / {{payload}}' }), {
      rawBody: JSON.stringify(body),
      body,
      query: {},
    });
    expect(extracted).toBe(`note: hello / ${JSON.stringify(body, null, 2)}`);
  });

  test('precedence and truncation to maxTextKb', () => {
    const textBody = { text: 'fast path' };
    expect(extractText(base, { rawBody: '{"text":"fast path"}', body: textBody, query: {} })).toBe(
      'fast path',
    );
    expect(
      extractText(config({ textPath: 'nope' }), {
        rawBody: '{"text":"fast path"}',
        body: textBody,
        query: {},
      }),
    ).toBe('fast path');
    const long = 'x'.repeat(3000);
    const truncated = extractText(config({ maxTextKb: 1 }), {
      rawBody: long,
      body: long,
      query: {},
    });
    expect(truncated.length).toBe(1024);
    expect(extractText(base, { rawBody: '', body: undefined, query: { text: 'from query' } })).toBe(
      'from query',
    );
    expect(canonicalQuery({ b: '2', a: '1' })).toBe('{"a":"1","b":"2"}');
  });
});
