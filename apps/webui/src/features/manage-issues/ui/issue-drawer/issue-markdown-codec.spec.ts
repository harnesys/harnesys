import { describe, expect, test } from 'bun:test';
import { markdownToHtml } from './issue-markdown-codec';

describe('markdownToHtml', () => {
  test('returns empty string for blank input', () => {
    expect(markdownToHtml('')).toBe('');
    expect(markdownToHtml('   \n  ')).toBe('');
  });

  test('converts headings', () => {
    expect(markdownToHtml('# Title')).toBe('<h1>Title</h1>');
    expect(markdownToHtml('## Sub')).toBe('<h2>Sub</h2>');
    expect(markdownToHtml('### Tiny')).toBe('<h3>Tiny</h3>');
  });

  test('converts inline formatting', () => {
    expect(markdownToHtml('**bold** and *italic*')).toBe(
      '<p><strong>bold</strong> and <em>italic</em></p>',
    );
    expect(markdownToHtml('`code`')).toBe('<p><code>code</code></p>');
    expect(markdownToHtml('[link](https://example.com)')).toBe(
      '<p><a href="https://example.com" target="_blank">link</a></p>',
    );
  });

  test('converts unordered and ordered lists', () => {
    expect(markdownToHtml('- a\n- b')).toBe('<ul><li><p>a</p></li><li><p>b</p></li></ul>');
    expect(markdownToHtml('1. a\n2. b')).toBe('<ol><li><p>a</p></li><li><p>b</p></li></ol>');
  });

  test('converts task lists', () => {
    const html = markdownToHtml('- [x] done\n- [ ] todo');
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-checked="true"');
  });

  test('converts fenced code blocks', () => {
    expect(markdownToHtml('```ts\nconst a = 1;\n```')).toBe(
      '<pre><code class="language-ts">const a = 1;</code></pre>',
    );
  });

  test('escapes raw html', () => {
    expect(markdownToHtml('<b>hi</b>')).toBe('<p>&lt;b&gt;hi&lt;/b&gt;</p>');
  });
});
