import { describe, expect, test } from 'bun:test';
import { redactSecrets } from './redact-secrets.ts';

describe('redactSecrets', () => {
  test('redacts bearer tokens', () => {
    const out = redactSecrets('curl -H "Authorization: Bearer abc123.def456_ghi" https://api');
    expect(out).not.toContain('abc123');
    expect(out).toContain('[REDACTED:bearer]');
  });

  test('redacts PEM private key blocks', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAK\n-----END RSA PRIVATE KEY-----';
    const out = redactSecrets(`key:\n${pem}\nafter`);
    expect(out).not.toContain('MIIEowIBAAK');
    expect(out).toContain('[REDACTED:pem]');
  });

  test('redacts known api key prefixes', () => {
    const out = redactSecrets(
      'sk-proj-abc123def456ghijkl ghp_0123456789abcdef xoxb-123-456-abcdef AKIAIOSFODNN7EXAMPLE',
    );
    expect(out).not.toContain('sk-proj-abc123def456ghijkl');
    expect(out).not.toContain('ghp_0123456789abcdef');
    expect(out).not.toContain('xoxb-123-456-abcdef');
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(out.match(/\[REDACTED:api-key\]/g)?.length).toBe(4);
  });

  test('redacts key=value assignments', () => {
    const out = redactSecrets('export API_KEY="supersecret" && npm_token=abc123def456 run');
    expect(out).not.toContain('supersecret');
    expect(out).not.toContain('abc123def456');
    expect(out).toContain('[REDACTED:assignment]');
  });

  test('does not touch plain text', () => {
    const src = 'const key = getName();\nconsole.log("token bucket algorithm");\nPASS tests: 3';
    expect(redactSecrets(src)).toBe(src);
  });

  test('does not touch short assignment values', () => {
    const src = 'limit=100; mode=fast; empty=';
    expect(redactSecrets(src)).toBe(src);
  });
});
