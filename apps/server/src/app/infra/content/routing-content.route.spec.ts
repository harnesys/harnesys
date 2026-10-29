import { describe, expect, test } from 'bun:test';
import type { OrgExecutionSnapshot } from '@harnesys/contracts';
import type { SourceRecord } from '../../domain/source/source-registry.port.ts';
import { contentRouteTarget, findSourceForContentRoute } from './routing-content.route.ts';

describe('contentRouteTarget', () => {
  test('proxies host-bound sources to the bound host', () => {
    expect(
      contentRouteTarget({
        localHostId: 'relay',
        distribution: { kind: 'host-bound', hostId: 'macbook' },
      }),
    ).toEqual({ hostId: 'macbook', remote: true });
  });

  test('keeps host-bound sources local on the bound host', () => {
    expect(
      contentRouteTarget({
        localHostId: 'macbook',
        distribution: { kind: 'host-bound', hostId: 'macbook' },
      }),
    ).toEqual({ hostId: 'macbook', remote: false });
  });

  test('keeps unbound sources on the local host', () => {
    expect(
      contentRouteTarget({
        localHostId: 'relay',
        distribution: {
          kind: 'cloud-drive',
          backend: 'google',
          remoteFolderId: 'folder-1',
          integrationId: '00000000-0000-4000-8000-000000000001',
        },
      }),
    ).toEqual({ hostId: 'relay', remote: false });
  });
});

describe('findSourceForContentRoute', () => {
  const localSource: SourceRecord = {
    id: 'src-1',
    orgId: 'org-1',
    name: 'Local',
    description: null,
    distribution: { kind: 'host-bound', hostId: 'macbook' },
    uiVisibility: 'org',
    managed: false,
    vcs: null,
    availability: { hostIds: [] },
    lspJson: null,
    createdAt: '2026-10-09T00:00:00.000Z',
    updatedAt: '2026-10-09T00:00:00.000Z',
  };

  const snapshot: OrgExecutionSnapshot = {
    schemaVersion: 1,
    revision: 4,
    runtime: { skillsSourceAutoLoad: true, timezone: 'UTC', browser: { defaultEngine: 'auto' } },
    agents: [],
    providers: [],
    models: [],
    fileAccessRules: [],
    sources: [
      {
        id: 'src-1',
        orgId: 'org-1',
        name: 'MB WS',
        description: null,
        distribution: { kind: 'host-bound', hostId: 'macbook' },
        uiVisibility: 'org',
        managed: false,
        vcs: null,
        availability: { hostIds: [] },
        createdAt: '2026-10-09T00:00:00.000Z',
        updatedAt: '2026-10-09T00:00:00.000Z',
      },
    ],
  };

  test('prefers local registry over snapshot', () => {
    const found = findSourceForContentRoute({
      orgId: 'org-1',
      sourceId: 'src-1',
      local: localSource,
      snapshot,
    });
    expect(found?.name).toBe('Local');
  });

  test('falls back to execution snapshot when worker local sources are empty', () => {
    const found = findSourceForContentRoute({
      orgId: 'org-1',
      sourceId: 'src-1',
      local: null,
      snapshot,
    });
    expect(found?.name).toBe('MB WS');
    expect(found?.distribution).toEqual({ kind: 'host-bound', hostId: 'macbook' });
  });

  test('returns null when source is absent from both local registry and snapshot', () => {
    expect(
      findSourceForContentRoute({
        orgId: 'org-1',
        sourceId: 'missing',
        local: null,
        snapshot,
      }),
    ).toBeNull();
  });
});
