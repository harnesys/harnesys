import { describe, expect, test } from 'bun:test';
import { WidgetDocSchema } from '@harnesys/contracts';
import { redactVaultRefs } from '../../domain/dashboards/vault-ref.ts';

const validDoc = {
  schemaVersion: 1,
  title: 'Build status',
  primitive: 'metric',
  sources: [
    {
      kind: 'orgApi',
      id: 'runs',
      path: '/orgs/acme-inc/threads',
    },
    {
      kind: 'external',
      id: 'ci',
      method: 'GET',
      url: 'https://ci.example.test/api/runs',
      headers: { authorization: 'Bearer {{vault:ci_token}}' },
      cacheTtlSeconds: 120,
    },
  ],
  config: { unit: 'runs' },
};

describe('widget doc validation golden fixtures', () => {
  test('valid doc parses and applies contract defaults', () => {
    const parsed = WidgetDocSchema.parse(validDoc);
    expect(parsed.sources).toHaveLength(2);
    expect(parsed.config).toEqual({ unit: 'runs' });
    const orgApiSource = parsed.sources[0];
    expect(orgApiSource).toMatchObject({ kind: 'orgApi', method: 'GET' });
  });

  test('orgApi source with non-org-scoped path is rejected', () => {
    const invalid = {
      ...validDoc,
      sources: [
        {
          kind: 'orgApi',
          id: 'runs',
          path: 'https://elsewhere.example.test/steal',
        },
      ],
    };
    expect(() => WidgetDocSchema.parse(invalid)).toThrow();
  });

  test('secret ref in header value stays unresolved in the doc and redacts the vault name', () => {
    const parsed = WidgetDocSchema.parse(validDoc);
    const externalSource = parsed.sources.find((source) => source.kind === 'external');
    if (externalSource?.kind !== 'external') {
      throw new Error('missing external source in fixture');
    }
    const header = externalSource.headers?.authorization ?? '';
    expect(header).toBe('Bearer {{vault:ci_token}}');
    const redacted = redactVaultRefs(header);
    expect(redacted).toBe('Bearer {{vault:***}}');
    expect(redacted).not.toContain('ci_token');
  });
});
