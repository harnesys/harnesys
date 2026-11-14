import { describe, expect, test } from 'bun:test';
import {
  computeHmac,
  constantTimeEqual,
  generateToken,
  stripSignaturePrefix,
  verifyHmac,
} from './auth.ts';

const SECRET = 'webhi…cret';
const BODY = '{"a":1}';

async function goldenHex(): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(BODY));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

describe('hmac verification', () => {
  test('computeHmac matches the WebCrypto golden vector', async () => {
    const expected = await goldenHex();
    expect(await computeHmac('sha256', 'hex', SECRET, BODY)).toBe(expected);
    expect(
      await verifyHmac(
        { signatureAlgo: 'sha256', signatureEncoding: 'hex' },
        SECRET,
        BODY,
        `sha256=${expected}`,
      ),
    ).toBe(true);
    expect(
      await verifyHmac(
        { signatureAlgo: 'sha256', signatureEncoding: 'hex' },
        SECRET,
        BODY,
        expected,
      ),
    ).toBe(true);
  });

  test('wrong signature and wrong body are rejected', async () => {
    expect(
      await verifyHmac(
        { signatureAlgo: 'sha256', signatureEncoding: 'hex' },
        SECRET,
        BODY,
        'sha256=deadbeef',
      ),
    ).toBe(false);
    const expected = await goldenHex();
    expect(
      await verifyHmac(
        { signatureAlgo: 'sha256', signatureEncoding: 'hex' },
        SECRET,
        '{"a":2}',
        `sha256=${expected}`,
      ),
    ).toBe(false);
  });

  test('stripSignaturePrefix keeps plain values and strips algo= prefixes', () => {
    expect(stripSignaturePrefix('sha256=abc123')).toBe('abc123');
    expect(stripSignaturePrefix('abc123')).toBe('abc123');
  });

  test('constantTimeEqual compares byte-wise', () => {
    expect(constantTimeEqual('abc123', 'abc123')).toBe(true);
    expect(constantTimeEqual('abc123', 'abc124')).toBe(false);
    expect(constantTimeEqual('abc123', 'abc12')).toBe(false);
  });

  test('generateToken returns 24 lowercase hex chars', () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{24}$/);
    expect(generateToken()).not.toBe(token);
  });
});
