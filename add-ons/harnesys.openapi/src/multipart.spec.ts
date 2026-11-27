import { describe, expect, test } from 'bun:test';
import { assembleFileBytes, multipartPayload, parseFiles } from './multipart.ts';

describe('parseFiles', () => {
  test('accepts exactly one of path, content or contentBase64', () => {
    expect(parseFiles([{ name: 'image', content: 'hello' }])).toEqual([
      { name: 'image', content: 'hello' },
    ]);
    expect(parseFiles([{ name: 'image', contentBase64: 'aGk=' }])).toEqual([
      { name: 'image', contentBase64: 'aGk=' },
    ]);
    expect(parseFiles([{ name: 'image', path: '/host/threads/t1/sandbox/flag.png' }])).toEqual([
      { name: 'image', path: '/host/threads/t1/sandbox/flag.png' },
    ]);
    expect(() => parseFiles([{ name: 'image', content: 'a', contentBase64: 'aGk=' }])).toThrow(
      /exactly one of/,
    );
    expect(() => parseFiles([{ name: 'image', path: 'a', content: 'b' }])).toThrow(
      /exactly one of/,
    );
    expect(() => parseFiles([{ name: 'image' }])).toThrow(/exactly one of/);
    expect(() => parseFiles([{ content: 'a' }])).toThrow(/name is required/);
    expect(() => parseFiles('nope')).toThrow(/must be an array/);
  });

  test('keeps optional filename and contentType', () => {
    const files = parseFiles([
      { name: 'image', filename: 'flag.png', contentType: 'image/png', contentBase64: 'aGk=' },
    ]);
    expect(files[0]).toEqual({
      name: 'image',
      filename: 'flag.png',
      contentType: 'image/png',
      contentBase64: 'aGk=',
    });
  });
});

describe('assembleFileBytes', () => {
  test('concatenates chunked base64 reads until eof', async () => {
    const bytes = Buffer.from('chunk-one|chunk-two|tail');
    const first = bytes.subarray(0, 8).toString('base64');
    const second = bytes.subarray(8, 18).toString('base64');
    const third = bytes.subarray(18).toString('base64');
    const calls: Array<{ path: string; offset: number }> = [];
    const result = await assembleFileBytes(
      '/host/threads/t1/sandbox/photo.jpg',
      async (path, offset) => {
        calls.push({ path, offset });
        const data = [first, second, third][calls.length - 1] ?? '';
        return { data, eof: calls.length === 3 };
      },
    );
    expect(Buffer.from(result).toString('utf8')).toBe('chunk-one|chunk-two|tail');
    expect(calls).toEqual([
      { path: '/host/threads/t1/sandbox/photo.jpg', offset: 0 },
      { path: '/host/threads/t1/sandbox/photo.jpg', offset: 8 },
      { path: '/host/threads/t1/sandbox/photo.jpg', offset: 18 },
    ]);
  });

  test('propagates read errors with context', async () => {
    await expect(
      assembleFileBytes('/host/threads/t1/sandbox/missing.jpg', async () => {
        throw new Error('no such file');
      }),
    ).rejects.toThrow('no such file');
  });
});

describe('multipartPayload', () => {
  test('builds a decodable form-data body with boundary in the content type', () => {
    const { bodyBase64, contentType } = multipartPayload({ alt: 'flag of WSO' }, [
      {
        name: 'image',
        filename: 'flag.png',
        contentType: 'image/png',
        contentBase64: Buffer.from('binary\0data').toString('base64'),
      },
    ]);
    expect(contentType).toMatch(/^multipart\/form-data; boundary=harnesys-/);
    const body = Buffer.from(bodyBase64, 'base64').toString('binary');
    expect(body).toContain('Content-Disposition: form-data; name="alt"');
    expect(body).toContain('flag of WSO');
    expect(body).toContain('Content-Disposition: form-data; name="image"; filename="flag.png"');
    expect(body).toContain('Content-Type: image/png');
    expect(body).toContain('binary\0data');
    expect(body.endsWith(`--${contentType.split('boundary=')[1]}--\r\n`)).toBe(true);
  });

  test('fields-only payload has no file parts', () => {
    const { bodyBase64 } = multipartPayload({ key: 'value' }, []);
    const body = Buffer.from(bodyBase64, 'base64').toString('utf8');
    expect(body).not.toContain('filename=');
    expect(body).toContain('name="key"');
  });
});
