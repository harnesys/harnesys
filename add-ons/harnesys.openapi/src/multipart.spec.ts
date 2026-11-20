import { describe, expect, test } from 'bun:test';
import { multipartPayload, parseFiles } from './multipart.ts';

describe('parseFiles', () => {
  test('accepts exactly one of content or contentBase64', () => {
    expect(parseFiles([{ name: 'image', content: 'hello' }])).toEqual([
      { name: 'image', content: 'hello' },
    ]);
    expect(parseFiles([{ name: 'image', contentBase64: 'aGk=' }])).toEqual([
      { name: 'image', contentBase64: 'aGk=' },
    ]);
    expect(() => parseFiles([{ name: 'image', content: 'a', contentBase64: 'aGk=' }])).toThrow(
      /exactly one of content/,
    );
    expect(() => parseFiles([{ name: 'image' }])).toThrow(/exactly one of content/);
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
