import { describe, expect, test } from 'bun:test';
import {
  applyVaultRefs,
  collectVaultRefs,
  redactVaultRefs,
} from '../../domain/dashboards/vault-ref.ts';

describe('vault-ref', () => {
  test('collect finds every {{vault:name}} occurrence with its token', () => {
    expect(collectVaultRefs('Bearer {{vault:api_key}}')).toEqual([
      { name: 'api_key', token: '{{vault:api_key}}' },
    ]);
    expect(collectVaultRefs('{{vault:a1}} {{vault:b_2}} {{vault:a1}}')).toEqual([
      { name: 'a1', token: '{{vault:a1}}' },
      { name: 'b_2', token: '{{vault:b_2}}' },
      { name: 'a1', token: '{{vault:a1}}' },
    ]);
    expect(collectVaultRefs('no refs here')).toEqual([]);
  });

  test('redaction strips secret names and roundtrips without leakage', () => {
    const raw = 'Basic {{vault:customer_token}} at {{vault:api_key}}';
    const redacted = redactVaultRefs(raw);
    expect(redacted).toBe('Basic {{vault:***}} at {{vault:***}}');
    expect(redacted).not.toContain('customer_token');
    expect(redacted).not.toContain('api_key');
  });

  test('applyVaultRefs substitutes each name once and fails closed on missing vault entry', () => {
    const resolve = (name: string): string | null => {
      if (name === 'host') {
        return 'https://example.test';
      }
      return name === 'path' ? 'v1/data' : null;
    };
    expect(applyVaultRefs('{{vault:host}}/{{vault:path}}', resolve)).toBe(
      'https://example.test/v1/data',
    );
    expect(applyVaultRefs('{{vault:missing}}', () => null)).toBeNull();
    expect(applyVaultRefs('plain value', () => null)).toBe('plain value');
  });
});
