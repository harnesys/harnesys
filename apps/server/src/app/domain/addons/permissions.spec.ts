import { describe, expect, test } from 'bun:test';
import type { PermissionRequest } from '@harnesys/sdk';
import { z } from 'zod';
import {
  computeEffectivePermissions,
  grantDiff,
  grantDigest,
  grantInherits,
  needsConsent,
  type PermissionDefinition,
  scopeIsSubset,
} from './permissions.ts';

const httpFetchDefinition: PermissionDefinition = {
  id: 'http.fetch',
  risk: 'medium',
  scope: z.object({ hosts: z.array(z.string()) }),
  covers(granted, needed) {
    const grantedHosts = granted?.hosts;
    const neededHosts = needed?.hosts;
    if (!Array.isArray(grantedHosts)) {
      return true;
    }
    if (!Array.isArray(neededHosts)) {
      return false;
    }
    const set = new Set(grantedHosts as string[]);
    return (neededHosts as string[]).every((host) => set.has(host));
  },
  describe() {
    return 'HTTP access';
  },
};

const baselineDefinition: PermissionDefinition = {
  id: 'db',
  risk: 'low',
  baseline: true,
  covers() {
    return true;
  },
  describe() {
    return 'Own database';
  },
};

function request(id: string, scope?: Record<string, unknown>): PermissionRequest {
  return { id, reason: 'needed', ...(scope ? { scope } : {}) };
}

describe('scopeIsSubset', () => {
  test('defined scope is a subset of undefined (any)', () => {
    expect(scopeIsSubset({ hosts: ['a.com'] }, undefined)).toBe(true);
  });

  test('undefined is not a subset of defined scope', () => {
    expect(scopeIsSubset(undefined, { hosts: ['a.com'] })).toBe(false);
  });

  test('host list must be contained', () => {
    expect(scopeIsSubset({ hosts: ['a.com'] }, { hosts: ['a.com', 'b.com'] })).toBe(true);
    expect(scopeIsSubset({ hosts: ['a.com', 'c.com'] }, { hosts: ['a.com', 'b.com'] })).toBe(false);
  });

  test('non-array values compare by JSON equality', () => {
    expect(scopeIsSubset({ level: 'read' }, { level: 'read' })).toBe(true);
    expect(scopeIsSubset({ level: 'write' }, { level: 'read' })).toBe(false);
  });
});

describe('computeEffectivePermissions', () => {
  test('baseline permissions are granted without declaration', () => {
    const effective = computeEffectivePermissions({
      declaration: [],
      grant: null,
      definitions: [baselineDefinition],
    });
    expect(effective.map((entry) => entry.id)).toEqual(['db']);
  });

  test('declaration without grant is not effective', () => {
    const effective = computeEffectivePermissions({
      declaration: [request('http.fetch', { hosts: ['api.github.com'] })],
      grant: null,
      definitions: [httpFetchDefinition, baselineDefinition],
    });
    expect(effective.map((entry) => entry.id)).toEqual(['db']);
  });

  test('granted permission keeps declared scope', () => {
    const effective = computeEffectivePermissions({
      declaration: [request('http.fetch', { hosts: ['api.github.com'] })],
      grant: {
        addonId: 'a.b',
        version: '1.0.0',
        declaredDigest: grantDigest([request('http.fetch', { hosts: ['api.github.com'] })]),
        grants: [{ id: 'http.fetch', scope: { hosts: ['api.github.com'] } }],
        grantedAt: '2026-01-01T00:00:00Z',
        grantedBy: 'admin',
      },
      definitions: [httpFetchDefinition],
    });
    expect(effective).toEqual([{ id: 'http.fetch', scope: { hosts: ['api.github.com'] } }]);
  });

  test('grant that does not cover the declared scope is dropped', () => {
    const effective = computeEffectivePermissions({
      declaration: [request('http.fetch', { hosts: ['api.github.com', 'api.gitlab.com'] })],
      grant: {
        addonId: 'a.b',
        version: '1.0.0',
        declaredDigest: '',
        grants: [{ id: 'http.fetch', scope: { hosts: ['api.github.com'] } }],
        grantedAt: '2026-01-01T00:00:00Z',
        grantedBy: 'admin',
      },
      definitions: [httpFetchDefinition],
    });
    expect(effective).toEqual([]);
  });

  test('forbidden permissions from org and host policy are removed', () => {
    const effective = computeEffectivePermissions({
      declaration: [request('http.fetch'), request('runs.dispatch')],
      grant: {
        addonId: 'a.b',
        version: '1.0.0',
        declaredDigest: '',
        grants: [{ id: 'http.fetch' }, { id: 'runs.dispatch' }],
        grantedAt: '',
        grantedBy: '',
      },
      orgPolicy: { forbiddenPermissions: ['runs.dispatch'] },
      hostPolicy: { forbiddenPermissions: ['http.fetch'] },
    });
    expect(effective).toEqual([]);
  });

  test('forbidden hosts narrow the scope and drop empty hosts', () => {
    const effective = computeEffectivePermissions({
      declaration: [
        request('http.fetch', { hosts: ['api.github.com', 'evil.example'] }),
        request('http.fetch', { hosts: ['evil.example'] }),
      ],
      grant: {
        addonId: 'a.b',
        version: '1.0.0',
        declaredDigest: '',
        grants: [{ id: 'http.fetch', scope: { hosts: ['api.github.com', 'evil.example'] } }],
        grantedAt: '',
        grantedBy: '',
      },
      hostPolicy: { forbiddenHosts: ['evil.example'] },
    });
    expect(effective).toEqual([{ id: 'http.fetch', scope: { hosts: ['api.github.com'] } }]);
  });
});

describe('grantDigest', () => {
  test('canonical: key and array order do not change the digest', () => {
    const a = [request('http.fetch', { hosts: ['b.com', 'a.com'] })];
    const b = [{ id: 'http.fetch', scope: { hosts: ['a.com', 'b.com'] }, reason: 'needed' }];
    expect(grantDigest(a)).toBe(grantDigest(b));
  });

  test('different declarations produce different digests', () => {
    expect(grantDigest([request('http.fetch')])).not.toBe(grantDigest([request('db')]));
  });
});

describe('grantDiff and needs_consent', () => {
  test('new permission means consent', () => {
    const diff = grantDiff(
      [request('http.fetch')],
      [request('http.fetch'), request('runs.dispatch')],
    );
    expect(diff.added.map((entry) => entry.id)).toEqual(['runs.dispatch']);
    expect(needsConsent(diff)).toBe(true);
  });

  test('removed permission does not mean consent', () => {
    const diff = grantDiff(
      [request('http.fetch'), request('runs.dispatch')],
      [request('http.fetch')],
    );
    expect(diff.removed.map((entry) => entry.id)).toEqual(['runs.dispatch']);
    expect(diff.added).toEqual([]);
    expect(needsConsent(diff)).toBe(false);
  });

  test('narrower scope keeps the grant, broader scope requires consent', () => {
    const previous = [request('http.fetch', { hosts: ['a.com', 'b.com'] })];
    const narrowed = grantDiff(previous, [request('http.fetch', { hosts: ['a.com'] })]);
    expect(needsConsent(narrowed)).toBe(false);
    const broadened = grantDiff(previous, [request('http.fetch', { hosts: ['a.com', 'c.com'] })]);
    expect(needsConsent(broadened)).toBe(true);
  });

  test('undefined scope is broader than a defined scope', () => {
    const diff = grantDiff([request('http.fetch', { hosts: ['a.com'] })], [request('http.fetch')]);
    expect(needsConsent(diff)).toBe(true);
  });
});

describe('grant inheritance', () => {
  test('unchanged declaration inherits the existing grant via digest', () => {
    const declaration = [request('http.fetch', { hosts: ['a.com'] })];
    const digest = grantDigest(declaration);
    const diff = grantDiff(declaration, [request('http.fetch', { hosts: ['a.com'] })]);
    expect(
      grantInherits(diff, digest, grantDigest([request('http.fetch', { hosts: ['a.com'] })])),
    ).toBe(true);
  });

  test('expanded declaration does not inherit', () => {
    const previous = [request('http.fetch')];
    const next = [request('http.fetch'), request('runs.dispatch')];
    const diff = grantDiff(previous, next);
    expect(grantInherits(diff, grantDigest(previous), grantDigest(next))).toBe(false);
  });
});
