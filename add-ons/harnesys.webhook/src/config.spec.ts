import { describe, expect, test } from 'bun:test';
import { parseHookConfig } from './config.ts';

describe('hook config parsing', () => {
  test('defaults for an empty config', () => {
    const config = parseHookConfig({});
    expect(config.auth).toBe('none');
    expect(config.signatureHeader).toBe('x-hub-signature-256');
    expect(config.signatureAlgo).toBe('sha256');
    expect(config.signatureEncoding).toBe('hex');
    expect(config.keyHeader).toBe('x-harnesys-key');
    expect(config.maxTextKb).toBe(8);
    expect(config.dedupeWindowSec).toBe(0);
    expect(config.throttleSec).toBe(0);
    expect(config.honorIdempotencyKey).toBe(true);
    expect(config.allowGet).toBe(false);
    expect(config.respondMode).toBe('default');
    expect(config.responseStatus).toBe(200);
    expect(config.textPath).toBe('');
    expect(config.detail).toBe('');
  });

  test('invalid values fall back to defaults, valid values win', () => {
    const fallback = parseHookConfig({
      auth: 42,
      signatureAlgo: 'md5',
      maxTextKb: 'eight',
      throttleSec: -5,
      honorIdempotencyKey: 'yes',
      responseStatus: 999,
    });
    expect(fallback.auth).toBe('none');
    expect(fallback.signatureAlgo).toBe('sha256');
    expect(fallback.maxTextKb).toBe(8);
    expect(fallback.throttleSec).toBe(0);
    expect(fallback.honorIdempotencyKey).toBe(true);
    expect(fallback.responseStatus).toBe(599);
    const parsed = parseHookConfig({
      auth: 'hmac',
      signatureHeader: 'X-Goog-Signature',
      signatureAlgo: 'sha512',
      signatureEncoding: 'base64',
      maxTextKb: 2.7,
      allowGet: true,
      respondMode: 'custom',
      responseStatus: 201,
    });
    expect(parsed.auth).toBe('hmac');
    expect(parsed.signatureHeader).toBe('x-goog-signature');
    expect(parsed.signatureAlgo).toBe('sha512');
    expect(parsed.signatureEncoding).toBe('base64');
    expect(parsed.maxTextKb).toBe(2);
    expect(parsed.allowGet).toBe(true);
    expect(parsed.respondMode).toBe('custom');
    expect(parsed.responseStatus).toBe(201);
  });
});
