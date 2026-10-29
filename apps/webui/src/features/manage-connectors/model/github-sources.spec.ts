import { describe, expect, test } from 'bun:test';
import type { Source, SourceVcs } from '@/shared/api/sources';
import { gitSourceCount, integrationGitSources } from './github-sources';

const ORG_ID = 'org-1';

function makeSource(id: string, vcs: SourceVcs | null): Source {
  return {
    id,
    orgId: ORG_ID,
    name: id,
    description: null,
    distribution: { kind: 'host-bound', hostId: 'host-1' },
    uiVisibility: 'org',
    managed: false,
    vcs,
    availability: { hostIds: [] },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('integrationGitSources', () => {
  test('keeps git sources bound to the integration', () => {
    const sources = [
      makeSource('s-1', {
        engine: 'git',
        remoteUrl: null,
        credRef: null,
        defaultBranch: 'main',
        integrationId: 'int-1',
      }),
      makeSource('s-2', {
        engine: 'git',
        remoteUrl: null,
        credRef: null,
        defaultBranch: 'main',
        integrationId: 'int-2',
      }),
      makeSource('s-3', null),
    ];
    expect(integrationGitSources(sources, 'int-1').map((source) => source.id)).toEqual(['s-1']);
  });

  test('keeps sources without vcs integrationId out', () => {
    const sources = [
      makeSource('s-1', {
        engine: 'git',
        remoteUrl: 'https://example.com/a.git',
        credRef: null,
        defaultBranch: 'main',
      }),
      makeSource('s-2', {
        engine: 'git',
        remoteUrl: null,
        credRef: null,
        defaultBranch: null,
        integrationId: null,
      }),
    ];
    expect(integrationGitSources(sources, 'int-1')).toEqual([]);
  });

  test('count matches the filtered list', () => {
    const sources = [
      makeSource('s-1', {
        engine: 'git',
        remoteUrl: null,
        credRef: null,
        defaultBranch: 'main',
        integrationId: 'int-1',
      }),
      makeSource('s-2', {
        engine: 'git',
        remoteUrl: null,
        credRef: null,
        defaultBranch: 'main',
        integrationId: 'int-1',
      }),
    ];
    expect(gitSourceCount(sources, 'int-1')).toBe(2);
    expect(gitSourceCount(sources, 'int-9')).toBe(0);
  });
});
