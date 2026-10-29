import { describe, expect, test } from 'bun:test';
import { buildTextMime, extractGmailAttachments, foldHeader } from './gmail-api.ts';

describe('buildTextMime', () => {
  test('builds RFC2822 message with CRLF and blank-line separator', () => {
    const mime = buildTextMime({ to: 'a@example.com', subject: 'Hello', body: 'line1\nline2' });
    expect(mime).toBe(
      [
        'To: a@example.com',
        'Subject: Hello',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 8bit',
        '',
        'line1',
        'line2',
      ].join('\r\n'),
    );
  });

  test('adds Cc only when provided and normalizes body newlines', () => {
    const withCc = buildTextMime({
      to: 'a@example.com',
      cc: 'b@example.com',
      subject: 's',
      body: 'x\r\ny',
    });
    expect(withCc).toContain('Cc: b@example.com\r\n');
    expect(withCc.endsWith('x\r\ny')).toBe(true);
    const withoutCc = buildTextMime({ to: 'a@example.com', subject: 's', body: 'x' });
    expect(withoutCc).not.toContain('Cc:');
  });

  test('strips CR/LF from headers to prevent header injection', () => {
    const mime = buildTextMime({
      to: 'a@example.com\r\nBcc: evil@example.com',
      subject: 's\nSubject: forged',
      body: 'x',
    });
    expect(mime.startsWith('To: a@example.com Bcc: evil@example.com\r\n')).toBe(true);
    const subjectLines = mime.split('\r\n').filter((line) => line.startsWith('Subject:'));
    expect(subjectLines).toEqual(['Subject: s Subject: forged']);
  });

  test('encodes non-ASCII subjects as RFC2047 encoded-words', () => {
    const mime = buildTextMime({
      to: 'a@example.com',
      subject: 'Тест письма',
      body: 'x',
    });
    const subjectLines = mime.split('\r\n').filter((line) => line.startsWith('Subject:'));
    expect(subjectLines).toHaveLength(1);
    const encoded = subjectLines[0]?.replace('Subject: ', '');
    expect(encoded).toMatch(/^(=\?UTF-8\?B\?[A-Za-z0-9+/]+\?=)( =\?UTF-8\?B\?[A-Za-z0-9+/]+\?=)*$/);
    for (const word of (encoded ?? '').split(' ')) {
      expect(word.length).toBeLessThanOrEqual(76);
      const decoded = Buffer.from(word.slice(10, -2), 'base64').toString('utf8');
      expect(decoded).toMatch(/[А-Яа-я]/);
    }
    const total = (encoded ?? '').replace(/=\?UTF-8\?B\?|\?=/g, '');
    expect(Buffer.from(total, 'base64').toString('utf8')).toBe('Тест письма');
  });

  test('folds long subject headers with space-continued lines', () => {
    const word = 'w'.repeat(20);
    const subject = Array.from({ length: 6 }, () => word).join(' ');
    const [first, ...continuations] = foldHeader(`Subject: ${subject}`);
    expect(first).toBeDefined();
    if (first === undefined) {
      return;
    }
    expect(first.length).toBeLessThanOrEqual(76);
    expect(first.startsWith('Subject: ')).toBe(true);
    for (const continuation of continuations) {
      expect(continuation.length).toBeLessThanOrEqual(76);
      expect(continuation.startsWith(' ')).toBe(true);
    }
    expect(foldHeader('Subject: short')).toEqual(['Subject: short']);
  });
});

describe('extractGmailAttachments', () => {
  test('collects parts with filename and attachmentId at any nesting depth', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: 'aGVsbG8=' } },
            {
              mimeType: 'application/pdf',
              filename: 'invoice.pdf',
              body: { attachmentId: 'ANGa1', size: 2048 },
            },
          ],
        },
        {
          mimeType: 'image/png',
          filename: 'photo.png',
          body: { attachmentId: 'ANGa2', size: 51200 },
        },
      ],
    };
    expect(extractGmailAttachments(payload)).toEqual([
      { attachmentId: 'ANGa1', filename: 'invoice.pdf', mimeType: 'application/pdf', size: 2048 },
      { attachmentId: 'ANGa2', filename: 'photo.png', mimeType: 'image/png', size: 51200 },
    ]);
  });

  test('skips inline text parts and nameless parts without attachmentId', () => {
    const payload = {
      mimeType: 'text/plain',
      body: { data: 'aGVsbG8=' },
      parts: [
        { mimeType: 'application/pdf', body: { attachmentId: 'ANGa3', size: 10 } },
        { mimeType: 'application/zip', filename: 'backup.zip', body: {} },
      ],
    };
    expect(extractGmailAttachments(payload)).toEqual([]);
  });
});
